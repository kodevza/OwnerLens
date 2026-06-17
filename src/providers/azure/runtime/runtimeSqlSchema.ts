import type { DuckDBConnection } from "@duckdb/node-api";

import { migrate } from "../../../db/migrate";

export async function prepareRuntimeSqlSchema(connection: DuckDBConnection): Promise<void> {
  await migrate(connection, "migrations", process.env.NODE_ENV === "test" ? null : console);
}
