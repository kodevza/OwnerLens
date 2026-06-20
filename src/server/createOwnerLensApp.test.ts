import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { LocalReportRuntime } from "../providers/azure/runtime/LocalReportRuntime";
import { createOwnerLensApp } from "./createOwnerLensApp";

const runtime = {} as unknown as LocalReportRuntime;

let distRoot: string;

beforeEach(() => {
  distRoot = mkdtempSync(path.join(tmpdir(), "ownerlens-dist-"));
  writeFileSync(path.join(distRoot, "index.html"), "<!doctype html><div id=\"root\"></div>");
  writeFileSync(path.join(distRoot, "app.js"), "console.log(\"ownerlens\");");
});

afterEach(() => {
  rmSync(distRoot, { force: true, recursive: true });
});

test("serves static files from the dist root", async () => {
  const app = createOwnerLensApp({ distRoot, runtime });

  const response = await app.request("/app.js");

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
  expect(await response.text()).toBe("console.log(\"ownerlens\");");
});

test("falls back to index.html for client-side routes", async () => {
  const app = createOwnerLensApp({ distRoot, runtime });

  const response = await app.request("/subscriptions/sub-1/resource-groups/rg-1");

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  expect(await response.text()).toBe("<!doctype html><div id=\"root\"></div>");
});

test("rejects non-GET static requests without replacing runtime API handling", async () => {
  const app = createOwnerLensApp({ distRoot, runtime });

  const staticResponse = await app.request("/app.js", { method: "POST" });
  const apiResponse = await app.request("/api/data/missing", { method: "POST" });

  expect(staticResponse.status).toBe(405);
  expect(await staticResponse.text()).toBe("Method Not Allowed");
  expect(apiResponse.status).toBe(404);
  expect(apiResponse.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
});
