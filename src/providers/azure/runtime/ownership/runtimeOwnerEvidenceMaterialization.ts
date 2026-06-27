import type { DuckDBConnection } from "@duckdb/node-api";

export async function rebuildRuntimeOwnerEvidenceMaterialization(
  connection: DuckDBConnection
): Promise<void> {
  await connection.run("begin transaction");
  try {
    await connection.run("delete from runtime_entra_principal_base_materialized");
    await connection.run(`
      insert into runtime_entra_principal_base_materialized
      select *
      from runtime_entra_principal_base_source
    `);
    await connection.run("delete from runtime_principal_resource_group_targets_materialized");
    await connection.run(`
      insert into runtime_principal_resource_group_targets_materialized
      select *
      from runtime_principal_resource_group_targets_source
    `);
    await connection.run("delete from runtime_owner_evidence_materialized");
    await connection.run(`
      insert into runtime_owner_evidence_materialized
      select *
      from runtime_owner_evidence_source
    `);
    await connection.run("delete from runtime_ranked_owner_candidates_materialized");
    await connection.run(`
      insert into runtime_ranked_owner_candidates_materialized
      select *
      from runtime_ranked_owner_candidates_source
    `);
    await connection.run("commit");
  } catch (error) {
    await connection.run("rollback");
    throw error;
  }
}
