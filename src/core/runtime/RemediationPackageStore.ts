import { randomUUID } from "node:crypto";

import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type {
  CreateRemediationPackageInput,
  JsonValue,
  RemediationPackage,
  RemediationTask
} from "./remediation";

type RemediationPackageRow = {
  id: string;
  created_at: string;
  source_kind: string;
  source_label: string;
  source_query: string;
  task_count: number;
};

type RemediationTaskRow = {
  id: string;
  package_id: string;
  created_at: string;
  status: RemediationTask["status"];
  target_kind: string;
  target_id: string;
  target_label: string;
  title: string;
  risk: string | null;
  source_evidence: string;
};

export class RemediationPackageStore {
  private readonly getConnection: () => DuckDBConnection;

  constructor(getConnection: () => DuckDBConnection) {
    this.getConnection = getConnection;
  }

  async createPackage(input: CreateRemediationPackageInput): Promise<RemediationPackage> {
    const connection = this.getConnection();
    const createdAt = new Date().toISOString();
    const packageId = randomUUID();
    const tasks = input.tasks.map((task) => ({
      ...task,
      id: randomUUID(),
      packageId,
      createdAt,
      status: "open" as const
    }));

    await connection.run(
      `insert into remediation_packages values (
        $id,
        $createdAt,
        $sourceKind,
        $sourceLabel,
        $sourceQuery::json,
        $taskCount
      )`,
      {
        id: packageId,
        createdAt,
        sourceKind: input.sourceKind,
        sourceLabel: input.sourceLabel,
        sourceQuery: JSON.stringify(input.sourceQuery),
        taskCount: tasks.length
      }
    );

    for (const task of tasks) {
      await connection.run(
        `insert into remediation_tasks values (
          $id,
          $packageId,
          $createdAt,
          $status,
          $targetKind,
          $targetId,
          $targetLabel,
          $title,
          $risk,
          $sourceEvidence::json
        )`,
        {
          id: task.id,
          packageId: task.packageId,
          createdAt: task.createdAt,
          status: task.status,
          targetKind: task.targetKind,
          targetId: task.targetId,
          targetLabel: task.targetLabel,
          title: task.title,
          risk: task.risk,
          sourceEvidence: JSON.stringify(task.sourceEvidence)
        }
      );
    }

    return {
      id: packageId,
      createdAt,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      sourceQuery: input.sourceQuery,
      taskCount: tasks.length,
      tasks
    };
  }

  async readPackage(packageId: string): Promise<RemediationPackage | null> {
    const connection = this.getConnection();
    const packages = await readRows<RemediationPackageRow>(
      connection,
      "select * from remediation_packages where id = $packageId",
      { packageId }
    );
    const row = packages[0];

    if (!row) {
      return null;
    }

    const tasks = await readRows<RemediationTaskRow>(
      connection,
      "select * from remediation_tasks where package_id = $packageId order by created_at, id",
      { packageId }
    );

    return toRemediationPackage(row, tasks);
  }

  async deleteTasks(packageId: string, taskIds: string[]): Promise<RemediationPackage | null> {
    const connection = this.getConnection();
    const existingPackage = await this.readPackage(packageId);

    if (!existingPackage) {
      return null;
    }

    for (const taskId of new Set(taskIds)) {
      await connection.run("delete from remediation_tasks where package_id = $packageId and id = $taskId", {
        packageId,
        taskId
      });
    }

    await connection.run(
      `
        update remediation_packages
        set task_count = (
          select count(*)
          from remediation_tasks
          where package_id = $packageId
        )
        where id = $packageId
      `,
      { packageId }
    );

    return this.readPackage(packageId);
  }
}

function toRemediationPackage(row: RemediationPackageRow, taskRows: RemediationTaskRow[]): RemediationPackage {
  return {
    id: row.id,
    createdAt: row.created_at,
    sourceKind: row.source_kind,
    sourceLabel: row.source_label,
    sourceQuery: parseJsonValue(row.source_query),
    taskCount: Number(row.task_count),
    tasks: taskRows.map(toRemediationTask)
  };
}

function toRemediationTask(row: RemediationTaskRow): RemediationTask {
  return {
    id: row.id,
    packageId: row.package_id,
    createdAt: row.created_at,
    status: row.status,
    targetKind: row.target_kind,
    targetId: row.target_id,
    targetLabel: row.target_label,
    title: row.title,
    risk: row.risk,
    sourceEvidence: parseJsonValue(row.source_evidence)
  };
}

function parseJsonValue(value: unknown): JsonValue {
  if (typeof value === "string") {
    return JSON.parse(value) as JsonValue;
  }

  return value as JsonValue;
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}
