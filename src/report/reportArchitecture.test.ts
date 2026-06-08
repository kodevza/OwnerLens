import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { applyCollectionControls } from "./applyCollectionControls.ts";
import { buildCollectionColumns } from "./buildCollectionColumns.tsx";
import type { ReportFieldDescriptor } from "./reportTypes.ts";

type Row = {
  id: string;
  owner: string;
  risk: "high" | "low" | "none";
};

const rows: Row[] = [
  { id: "platform-high", owner: "platform-team@example.com", risk: "high" },
  { id: "platform-low", owner: "platform-team@example.com", risk: "low" },
  { id: "app-high", owner: "app-team@example.com", risk: "high" }
];

const fields: ReportFieldDescriptor<Row>[] = [
  {
    id: "owner",
    label: "Owner",
    valueType: "text",
    getValue: (row) => row.owner
  },
  {
    id: "risk",
    label: "Permission risk",
    valueType: "riskLevel",
    getValue: (row) => row.risk,
    filter: {
      kind: "multiSelect"
    }
  }
];

test("generic filter engine applies provider-defined field filters", () => {
  const filteredRows = applyCollectionControls(rows, fields, {
    query: "platform",
    filters: {
      risk: { type: "values", values: ["high"] }
    }
  }).controlledRows;

  expect(filteredRows.map((row) => row.id)).toEqual(["platform-high"]);
});

test("generic column factory builds columns from field descriptors", () => {
  const columns = buildCollectionColumns(fields);

  expect(columns.map((column) => [column.id, column.label, column.filter])).toEqual([
    ["owner", "Owner", "auto"],
    ["risk", "Permission risk", "multiselect"]
  ]);
  expect(columns[1]).not.toHaveProperty("getValue");
  expect(columns[1].render).toEqual(expect.any(Function));
});

test("Azure provider source does not contain UI rendering concepts", () => {
  const providerSources = readSourceFiles(join(process.cwd(), "src/providers/azure"));

  for (const [file, source] of providerSources) {
    expect({ file, source }).toEqual({
      file,
      source: expect.not.stringMatching(/from\s+["'][^"']*\.tsx["']/)
    });
    expect({ file, source }).toEqual({
      file,
      source: expect.not.stringMatching(/from\s+["'][^"']*(components|ui)\/[^"']*["']/)
    });
    expect({ file, source }).toEqual({
      file,
      source: expect.not.stringMatching(/\bcell\s*:/)
    });
    expect({ file, source }).toEqual({
      file,
      source: expect.not.stringMatching(/<\s*(Badge|Table|DetailsCell)\b/)
    });
  }
});

test("generic report source does not import Azure directly", () => {
  const reportSources = readSourceFiles(join(process.cwd(), "src/report"));

  for (const [file, source] of reportSources) {
    expect({ file, source }).toEqual({
      file,
      source: expect.not.stringMatching(/providers\/azure/)
    });
  }
});

function readSourceFiles(root: string): Array<[string, string]> {
  return walk(root)
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file))
    .map((file) => [relative(process.cwd(), file), readFileSync(file, "utf8")]);
}

function walk(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) {
    return [path];
  }

  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}
