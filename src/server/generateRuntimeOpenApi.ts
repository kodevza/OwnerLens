import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateRuntimeOpenApiDocument } from "../core/runtime/openApi";
import { defineLocalReportRuntimeRestEndpoints } from "../providers/azure/runtime/localReportRuntimeRestEndpoints";
import type { LocalReportRuntimeRestRuntime } from "../providers/azure/runtime/localReportRuntimeRestRuntime";

async function main(): Promise<void> {
  const root = process.cwd();
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { version?: string };
  const outputPath = path.join(root, "contracts", "runtime.openapi.json");
  const endpoints = defineLocalReportRuntimeRestEndpoints(createOpenApiRuntimeStub());
  const document = generateRuntimeOpenApiDocument({
    title: "OwnerLens Runtime API",
    version: packageJson.version ?? "0.0.0",
    endpoints
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function createOpenApiRuntimeStub(): LocalReportRuntimeRestRuntime {
  return new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error("Runtime OpenAPI generation must not execute endpoint handlers.");
        };
      }
    }
  ) as LocalReportRuntimeRestRuntime;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
