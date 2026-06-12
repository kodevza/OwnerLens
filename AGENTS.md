# AGENTS.md

## Purpose

OwnerLens is a local-first Azure and Entra ownership evidence tool. It reads snapshot files from `./data`, resolves likely accountable owners for Azure resources and workload identities, and produces evidence-backed reporting for IAM/governance/remediation workflows.

Keep the product scope narrow: ownership evidence, accountability, remediation assignment, Azure/Entra snapshots, workload identities, and ZTA enrichment. Do not reframe it as a generic CSPM, compliance dashboard, cost tool, access-review replacement, or broad cloud security scanner.

## Repository map

- `bin/ownerlens.js` is the npm CLI entrypoint for `ownerlens start`, `preview`, `collect:azure`, and `collect:entra`.
- `vite.config.ts` installs the local Vite runtime API under `/api/data`.
- `tools/*.ps1` exports Azure and Microsoft Entra snapshot JSON files.
- `src/core` contains pure domain types, ownership primitives, config, and runtime helpers.
- `src/providers/azure` contains Azure/Entra DTOs, ownership logic, DuckDB-backed runtime, snapshot import, enrichment, and provider-specific query services.
- `src/report` contains mostly provider-neutral report/table UI logic and reusable report components.
- `src/components/azure` wires Azure-specific views, tabs, API calls, and column help into React.
- `src/lib` contains small generic utilities.

## Architecture rules

Follow the dependency boundaries already enforced by `.dependency-cruiser.cjs`:

- `src/core/**` must not import from outside `src/core/**`.
- `src/lib/**` must not import from outside `src/lib/**`.
- `src/providers/**` must not import React UI code, `src/components/**`, `src/ui/**`, or `.tsx` files.
- `src/components/**` must not import provider modules from `src/providers/**`; use `src/core/**` domain types or component/report-facing adapters instead.
- `src/report/**` must not import Azure provider modules directly.
- Put Azure-specific data access and enrichment in `src/providers/azure/**`, not in generic report components.
- Keep React as presentation/orchestration. Put reusable analysis logic in TypeScript domain/runtime modules, not inside components.

## Local data and security

- Treat `./data` as sensitive local tenant data. Snapshot JSON, DuckDB files, activity logs, tenant IDs, subscription IDs, and generated runtime state must not be committed.
- Existing snapshot filename validation is intentional. Do not weaken `snapshotNamePattern` or path traversal protections.
- Prefer local processing. Do not add network calls, telemetry, SaaS upload paths, or external enrichment unless explicitly requested.
- Do not add new production dependencies without a clear reason and explicit approval.

## Setup commands

Use npm, not pnpm/yarn, because this repo has `package-lock.json`.

```bash
npm install
npm run start
npm run build
npm test
npm run test:all
npm run lint
```

Useful focused checks:

```bash
npm run test:node
npm run test:duckdb
npm run test:components
npm run deps:graph
npm run deps:graph:files
```

Collectors require local Azure/Microsoft Graph authentication and should not be run blindly:

```bash
npm run collect:azure -- -SubscriptionIds "<subscription-id>"
npm run collect:entra -- -TenantId "<tenant-id>"
```

## Testing expectations

- Add or update focused tests for ownership resolution, runtime import/query behavior, filtering, pagination, report rendering, and PowerShell script changes.
- Run the smallest relevant test first, then the broader check before finishing.
- For TypeScript/React changes, run `npm run build` and the relevant Jest suite.
- For dependency-boundary or import moves, run `npm run deps:graph` or dependency-cruiser directly if needed.
- For component behavior, use the existing jsdom/React `act` style. Do not introduce another component test framework unless requested.

## DuckDB/runtime rules

- DuckDB tests are isolated in `jest.duckdb.config.cjs` and launched through `tools/run-duckdb-jest.cjs`; keep that split unless there is a strong reason to change it.
- Always close `LocalReportRuntime`, DuckDB connections, and DuckDB instances in `finally` blocks or test cleanup.
- Use temporary directories for runtime tests. Do not point tests at a real `./data/runtime.duckdb`.
- Be careful with large JSON imports and nested arrays. Avoid loading entire large tenant snapshots into memory when a streaming, chunked, projected, or paginated path is possible.
- Preserve deterministic import status reporting through `getStatus()` when changing snapshot import logic.

## Code style

- TypeScript is strict. Avoid `any`; prefer typed DTOs, discriminated unions, and explicit return types on exported functions.
- Name raw snapshot/collector input transfer object types with an `Input*` prefix when adding or touching them, and keep them separate from `src/core/**` domain types.
- Follow the existing style: double quotes, semicolons, ESM imports, React function components, and small pure helpers.
- Do not mix data mapping, runtime I/O, and UI rendering in one module.
- Keep PR-sized changes small. Avoid drive-by refactors, formatting-only churn, and unrelated renames.
- Keep public UI labels and docs in English unless the task explicitly asks otherwise.

## Product behavior rules

- Ownership evidence should be traceable. When adding or changing owner resolution, preserve source, confidence, and evidence trail fields.
- Confidence semantics matter: strong tag/config evidence should outrank weaker activity/RBAC-derived evidence.
- Activity-log fallback is low-confidence evidence, not proof of ownership.
- Service principals, managed identities, app registrations, Azure RBAC, groups, tags, and activity logs are evidence signals, not final truth.
- ZTA findings should be enriched into owner-assigned remediation context, not treated as standalone generic security findings.

## Documentation updates

- Update `README.md`, `tools/README.md`, or `CONTRIBUTING.md` only when user-visible behavior, commands, snapshot schema, or setup expectations change.
- Keep docs concise and operational. Avoid marketing filler.
- If CLI behavior changes, update `bin/ownerlens.js` help text and README examples together.
