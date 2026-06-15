import {
  applyRuntimeCollectionFilters,
  applyRuntimeCollectionSort,
  buildCollectionColumns,
  type LocalReportCollectionFilter
} from "./collections";
import type { SortRule } from "../collectionControls";
import { serializeRuntimeCsv, type RuntimeCsvColumn } from "./csv";

export type RuntimeCollectionCsvExport<CollectionId extends string = string> = {
  kind: "csv";
  collectionId: CollectionId;
  fileName: string;
  contentType: "text/csv; charset=utf-8";
  body: string;
  columns: string[];
  count: number;
};

export type RuntimeCollectionCsvExportInput<CollectionId extends string = string> = {
  collectionId: CollectionId;
  rows: Record<string, unknown>[];
  fileName: string;
  filters?: LocalReportCollectionFilter[];
  sortRules?: SortRule[];
  selectedRowKeys?: string[];
  getRowKey?: (row: Record<string, unknown>) => string;
  columns?: readonly RuntimeCsvColumn[];
  includeBom?: boolean;
};

export function buildRuntimeCollectionCsvExport<CollectionId extends string>(
  input: RuntimeCollectionCsvExportInput<CollectionId>
): RuntimeCollectionCsvExport<CollectionId> {
  const columns = input.columns ?? buildCollectionColumns(input.rows);
  const columnIds = columns.map((column) => (typeof column === "string" ? column : column.id));
  const filteredRows = applyRuntimeCollectionFilters(input.rows, columnIds, input.filters ?? []);
  const selectedRows = applySelectedRowKeys(filteredRows, input.selectedRowKeys ?? [], input.getRowKey);
  const sortedRows = applyRuntimeCollectionSort(selectedRows, columnIds, input.sortRules ?? []);

  return {
    kind: "csv",
    collectionId: input.collectionId,
    fileName: input.fileName,
    contentType: "text/csv; charset=utf-8",
    body: serializeRuntimeCsv(sortedRows, {
      columns,
      includeBom: input.includeBom
    }),
    columns: columnIds,
    count: sortedRows.length
  };
}

function applySelectedRowKeys(
  rows: Record<string, unknown>[],
  selectedRowKeys: string[],
  getRowKey: ((row: Record<string, unknown>) => string) | undefined
): Record<string, unknown>[] {
  const selectedRowKeySet = new Set(selectedRowKeys.map((rowKey) => rowKey.trim()).filter(Boolean));
  if (selectedRowKeySet.size === 0) {
    return rows;
  }

  if (!getRowKey) {
    return rows;
  }

  return rows.filter((row) => selectedRowKeySet.has(getRowKey(row)));
}
