import type { DuckDBConnection } from "@duckdb/node-api";

import type { AppConfig } from "../../../../core/config";

export class OwnerTagConfigSeedService {
  private readonly getConnection: () => DuckDBConnection;
  private readonly getConfig: () => AppConfig;

  constructor(options: { getConnection: () => DuckDBConnection; getConfig: () => AppConfig }) {
    this.getConnection = options.getConnection;
    this.getConfig = options.getConfig;
  }

  async seed(): Promise<void> {
    const connection = this.getConnection();
    const ownerTags = this.getConfig().azure.ownership.ownerTags;

    await connection.run("begin transaction");
    try {
      await connection.run("delete from azure_owner_tag_config");

      for (const [index, tag] of ownerTags.entries()) {
        await connection.run(
          `insert into azure_owner_tag_config (priority, name, confidence, owner_type)
          values ($priority, $name, $confidence, $ownerType)`,
          {
            priority: index + 1,
            name: tag.name,
            confidence: tag.confidence,
            ownerType: tag.type
          }
        );
      }

      await connection.run("commit");
    } catch (error) {
      await connection.run("rollback").catch(() => {});
      throw error;
    }
  }
}
