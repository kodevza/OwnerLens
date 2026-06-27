#!/usr/bin/env node

import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { DuckDBInstance } from "@duckdb/node-api";

const require = createRequire(import.meta.url);
const DEFAULT_ITERATIONS = 10;
const DEFAULT_WARMUPS = 3;
const DEFAULT_PAGE_SIZE = 20;
const JSON_COLUMNS = [
  "replyUrls",
  "servicePrincipalNames",
  "tags",
  "appRoles",
  "servicePrincipalOwners",
  "applicationOwners",
  "metadata",
  "roleAssignments",
  "assignedResourceGroups",
  "managedIdentityAssignments",
  "ownerCandidates",
  "potentialOwners"
];

const options = parseOptions(process.argv.slice(2));
const dataDir = path.resolve(process.env.OWNERLENS_DATA_DIR?.trim() || path.join(process.cwd(), "data"));
const databasePath = path.join(dataDir, "runtime.duckdb");
const databaseStat = await stat(databasePath).catch(() => null);

if (!databaseStat?.isFile()) {
  fail(`OwnerLens runtime database was not found: ${databasePath}`);
}

process.stderr.write(
  `Opening DuckDB database: ${databasePath}\n` +
  `Profiling service principal queries (${options.warmups} warmups, ${options.iterations} measured iterations)...\n`
);

const instance = await DuckDBInstance.create(databasePath, { access_mode: "READ_ONLY" });
const connection = await instance.connect();

try {
  const metadata = await readMetadata(connection, databaseStat.size);
  const queries = buildQueries(options.pageSize);
  const benchmarks = [];

  for (const benchmark of queries) {
    process.stderr.write(`  ${benchmark.name}\n`);
    benchmarks.push(await measureQuery(connection, benchmark, options));
  }

  process.stderr.write("  endpoint_pair_same_connection\n");
  benchmarks.push(await measureQueryPair(
    connection,
    "endpoint_pair_same_connection",
    queries.find((query) => query.name === "collection_page_full").sql,
    queries.find((query) => query.name === "collection_count").sql,
    options
  ));

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    parameters: options,
    environment: metadata.environment,
    database: metadata.database,
    cardinalities: metadata.cardinalities,
    benchmarks
  }, null, 2)}\n`);
} finally {
  connection.disconnectSync();
  instance.closeSync();
}

function buildQueries(pageSize) {
  const principalFilter = `"servicePrincipalType" <> 'ManagedIdentity'`;
  const pageSuffix = `where ${principalFilter} order by ordinal asc limit ${pageSize}`;

  return [
    {
      name: "base_count",
      purpose: "Materialized principal base count without collection joins.",
      sql: `select count(*) as count from runtime_entra_principal_base where ${principalFilter}`
    },
    {
      name: "base_page",
      purpose: "Materialized principal base page without collection joins.",
      sql: `select * from runtime_entra_principal_base ${pageSuffix}`
    },
    {
      name: "rbac_join_normalized",
      purpose: "RBAC left join on already normalized principal IDs.",
      sql: `
        select principal.id, enrichment.role_assignments
        from runtime_entra_principal_base principal
        left join azure_identity_role_assignment_enrichment enrichment
          on enrichment.principal_id = principal.id
        left join runtime_latest_enrichment_run latest_run
          on latest_run.run_id = enrichment.run_id
        ${pageSuffix}
      `
    },
    {
      name: "rbac_join_expression",
      purpose: "RBAC left join with lower(trim()) expressions used by the collection view.",
      sql: `
        select principal.id, enrichment.role_assignments
        from runtime_entra_principal_base principal
        left join azure_identity_role_assignment_enrichment enrichment
          on lower(trim(enrichment.principal_id)) = lower(trim(principal.id))
        left join runtime_latest_enrichment_run latest_run
          on latest_run.run_id = enrichment.run_id
        ${pageSuffix}
      `
    },
    {
      name: "rbac_correlated_json_each",
      purpose: "Correlated json_each and distinct subscription aggregation from the collection view.",
      sql: `
        with principal_rbac_enrichment as (
          select
            role_enrichment.principal_id,
            role_enrichment.role_assignments,
            (
              select count(distinct coalesce(
                nullif(json_extract_string(role_entry.value, '$.subscriptionId'), ''),
                nullif(json_extract_string(role_entry.value, '$.scopeSubscriptionId'), '')
              ))
              from json_each(role_enrichment.role_assignments) role_entry
              where coalesce(
                nullif(json_extract_string(role_entry.value, '$.subscriptionId'), ''),
                nullif(json_extract_string(role_entry.value, '$.scopeSubscriptionId'), '')
              ) is not null
            ) as rbac_subscription_count
          from azure_identity_role_assignment_enrichment role_enrichment
          join runtime_latest_enrichment_run latest_run on latest_run.run_id = role_enrichment.run_id
        )
        select principal.id, enrichment.role_assignments, enrichment.rbac_subscription_count
        from runtime_entra_principal_base principal
        left join principal_rbac_enrichment enrichment
          on lower(trim(enrichment.principal_id)) = lower(trim(principal.id))
        ${pageSuffix}
      `
    },
    {
      name: "owner_evidence_anti_join",
      purpose: "Correlated NOT EXISTS with OR over disabled owner evidence keys.",
      sql: `
        select candidate.*
        from runtime_ranked_owner_candidates candidate
        where not exists (
          select 1
          from disabled_owner_evidence_keys disabled
          where disabled.provider = 'azure'
            and (
              lower(trim(disabled.owner_key)) = lower(trim(candidate."evidenceKey"))
              or lower(trim(disabled.owner_key)) = lower(trim(candidate."ownerCandidate"))
            )
        )
      `
    },
    {
      name: "collection_id_page",
      purpose: "ID-only projection showing whether the collection CTE pipeline is pruned before LIMIT.",
      sql: `select id from runtime_entra_principal_collection_rows ${pageSuffix}`
    },
    {
      name: "collection_page_full",
      purpose: "Exact full collection page query used by the service principal endpoint.",
      parseCollectionJson: true,
      sql: `select * from runtime_entra_principal_collection_rows ${pageSuffix}`
    },
    {
      name: "collection_page_full_threads_1",
      purpose: "Full collection page forced to one DuckDB thread to detect platform-specific scheduling overhead.",
      parseCollectionJson: true,
      threads: 1,
      sql: `select * from runtime_entra_principal_collection_rows ${pageSuffix}`
    },
    {
      name: "collection_count",
      purpose: "Exact collection count query used by the service principal endpoint.",
      sql: `
        select count(*) as count
        from (
          select *
          from runtime_entra_principal_collection_rows
          where ${principalFilter}
        ) collection_rows
      `
    }
  ];
}

async function measureQuery(connection, benchmark, options) {
  const samples = [];
  const originalThreads = benchmark.threads === undefined
    ? null
    : Number((await readSingleRow(connection, "select current_setting('threads') as threads")).threads);

  if (benchmark.threads !== undefined) {
    await connection.run(`set threads = ${benchmark.threads}`);
  }

  try {
    for (let iteration = 0; iteration < options.warmups + options.iterations; iteration += 1) {
      const queryStarted = performance.now();
      const reader = await connection.runAndReadAll(benchmark.sql);
      const queryFinished = performance.now();
      const rows = reader.getRowObjectsJson();
      const conversionFinished = performance.now();
      const mappedRows = benchmark.parseCollectionJson ? parseCollectionJson(rows) : rows;
      const mappingFinished = performance.now();
      const body = JSON.stringify(mappedRows);
      const serializationFinished = performance.now();

      if (iteration >= options.warmups) {
        samples.push(createSample(
          queryStarted,
          queryFinished,
          conversionFinished,
          mappingFinished,
          serializationFinished,
          rows.length,
          body
        ));
      }
    }
  } finally {
    if (originalThreads !== null) {
      await connection.run(`set threads = ${originalThreads}`);
    }
  }

  return {
    name: benchmark.name,
    purpose: benchmark.purpose,
    ...(benchmark.threads === undefined ? {} : { duckdbThreads: benchmark.threads }),
    ...summarizeSamples(samples)
  };
}

async function measureQueryPair(connection, name, pageSql, countSql, options) {
  const samples = [];

  for (let iteration = 0; iteration < options.warmups + options.iterations; iteration += 1) {
    const queryStarted = performance.now();
    const [pageReader, countReader] = await Promise.all([
      connection.runAndReadAll(pageSql),
      connection.runAndReadAll(countSql)
    ]);
    const queryFinished = performance.now();
    const pageRows = pageReader.getRowObjectsJson();
    const countRows = countReader.getRowObjectsJson();
    const conversionFinished = performance.now();
    const mappedRows = parseCollectionJson(pageRows);
    const mappingFinished = performance.now();
    const body = JSON.stringify({ rows: mappedRows, count: countRows[0]?.count ?? 0 });
    const serializationFinished = performance.now();

    if (iteration >= options.warmups) {
      samples.push(createSample(
        queryStarted,
        queryFinished,
        conversionFinished,
        mappingFinished,
        serializationFinished,
        pageRows.length,
        body
      ));
    }
  }

  return {
    name,
    purpose: "Concurrent page and count queries on the same DuckDB connection, matching endpoint behavior.",
    ...summarizeSamples(samples)
  };
}

function createSample(started, queried, converted, mapped, serialized, rowCount, body) {
  return {
    queryMs: queried - started,
    nativeToJsMs: converted - queried,
    mappingMs: mapped - converted,
    stringifyMs: serialized - mapped,
    totalMs: serialized - started,
    rowCount,
    responseBytes: Buffer.byteLength(body)
  };
}

function parseCollectionJson(rows) {
  return rows.map((row) => {
    const mapped = { ...row };
    for (const column of JSON_COLUMNS) {
      const value = mapped[column];
      if (typeof value === "string" && value) {
        mapped[column] = JSON.parse(value);
      }
    }
    return mapped;
  });
}

function summarizeSamples(samples) {
  return {
    resultShape: {
      rowCount: samples[0]?.rowCount ?? 0,
      responseBytes: samples[0]?.responseBytes ?? 0
    },
    timingsMs: Object.fromEntries(
      ["queryMs", "nativeToJsMs", "mappingMs", "stringifyMs", "totalMs"].map((field) => [
        field.replace(/Ms$/, ""),
        summarizeValues(samples.map((sample) => sample[field]))
      ])
    ),
    samples: samples.map((sample) => ({
      query: round(sample.queryMs),
      nativeToJs: round(sample.nativeToJsMs),
      mapping: round(sample.mappingMs),
      stringify: round(sample.stringifyMs),
      total: round(sample.totalMs)
    }))
  };
}

function summarizeValues(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: round(sorted[0] ?? 0),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1) ?? 0),
    mean: round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1))
  };
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return 0;
  }

  return sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentileValue) - 1)];
}

async function readMetadata(connection, databaseSizeBytes) {
  const runtime = await readSingleRow(connection, `
    select
      version() as duckdb_version,
      current_setting('threads') as threads,
      current_setting('memory_limit') as memory_limit
  `);
  const cardinalities = await readSingleRow(connection, `
    select
      (select count(*) from runtime_entra_principal_base) as principal_base,
      (select count(*) from azure_identity_role_assignment_enrichment) as rbac_enrichment,
      (select count(*) from azure_managed_identity_assignment_enrichment) as managed_identity_enrichment,
      (select count(*) from runtime_principal_resource_group_targets) as resource_group_targets,
      (select count(*) from runtime_ranked_owner_candidates) as ranked_owner_candidates,
      (select count(*) from disabled_owner_evidence_keys) as disabled_owner_evidence
  `);
  const cpu = os.cpus()[0];

  return {
    environment: {
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      nodeVersion: process.version,
      duckdbNodeApiVersion: readPackageVersion("@duckdb/node-api"),
      duckdbNodeBindingsVersion: readPackageVersion("@duckdb/node-bindings"),
      cpuModel: cpu?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      duckdbVersion: runtime.duckdb_version,
      duckdbThreads: runtime.threads,
      duckdbMemoryLimit: runtime.memory_limit
    },
    database: {
      fileName: path.basename(databasePath),
      sizeBytes: databaseSizeBytes
    },
    cardinalities
  };
}

async function readSingleRow(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson()[0] ?? {};
}

function readPackageVersion(packageName) {
  try {
    return require(`${packageName}/package.json`).version;
  } catch {
    return "unknown";
  }
}

function parseOptions(args) {
  const parsed = {
    iterations: DEFAULT_ITERATIONS,
    warmups: DEFAULT_WARMUPS,
    pageSize: DEFAULT_PAGE_SIZE
  };

  for (const arg of args) {
    const [name, rawValue] = arg.split("=", 2);
    if (name === "--iterations") {
      parsed.iterations = readPositiveInteger(name, rawValue);
    } else if (name === "--warmups") {
      parsed.warmups = readNonNegativeInteger(name, rawValue);
    } else if (name === "--page-size") {
      parsed.pageSize = readPositiveInteger(name, rawValue);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function readPositiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail(`${name} must be a positive integer.`);
  }
  return parsed;
}

function readNonNegativeInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function round(value) {
  return Number(value.toFixed(3));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
