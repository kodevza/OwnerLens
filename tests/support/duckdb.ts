import { DuckDBInstance } from "@duckdb/node-api";

type TestGlobal = typeof globalThis & {
  gc?: () => void;
};

export type DuckDbTestInstance = Awaited<ReturnType<typeof DuckDBInstance.create>>;
export type DuckDbTestConnection = Awaited<ReturnType<DuckDbTestInstance["connect"]>>;

type DuckDbTestContext = {
  instance: DuckDbTestInstance;
  connection: DuckDbTestConnection;
};

export function installDuckDbHandleCleanup(): void {
  afterEach(async () => {
    await collectDuckDbNativeHandles();
  });

  afterAll(async () => {
    await collectDuckDbNativeHandles();
  });
}

export async function collectDuckDbNativeHandles(): Promise<void> {
  const gc = (globalThis as TestGlobal).gc;

  if (!gc) {
    return;
  }

  for (let cycle = 0; cycle < 3; cycle += 1) {
    gc();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

export async function withDuckDb<T>(
  fn: (ctx: DuckDbTestContext) => Promise<T> | T,
  options: { databasePath?: string } = {}
): Promise<T> {
  const instance = await DuckDBInstance.create(options.databasePath ?? ":memory:");
  const connection = await instance.connect();

  try {
    return await fn({ instance, connection });
  } finally {
    connection.disconnectSync();
    instance.closeSync();
  }
}
