import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

export type RuntimeHostOptions = {
  databasePath: string;
};

export class RuntimeHost {
  private readonly databasePath: string;
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private initializePromise: Promise<void> | null = null;
  private initialized = false;

  constructor(options: RuntimeHostOptions) {
    this.databasePath = options.databasePath;
  }

  getDatabasePath(): string {
    return this.databasePath;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  initialize(): Promise<void> {
    this.initializePromise ??= this.initializeInternal();
    return this.initializePromise;
  }

  requireConnection(): DuckDBConnection {
    if (!this.connection) {
      throw new Error("Local report runtime is not initialized.");
    }

    return this.connection;
  }

  async close(): Promise<void> {
    this.connection?.disconnectSync();
    this.connection = null;
    this.instance?.closeSync();
    this.instance = null;
    this.initializePromise = null;
    this.initialized = false;
  }

  private async initializeInternal(): Promise<void> {
    if (this.databasePath !== ":memory:") {
      await mkdir(path.dirname(this.databasePath), { recursive: true });
    }

    this.instance = await DuckDBInstance.create(this.databasePath);
    this.connection = await this.instance.connect();
    this.initialized = true;
  }
}
