import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildCollectionColumns } from "../../buildCollectionColumns";
import {
  applyColumnFilterValueToggle,
  applyColumnObjectFieldFilter,
  applyColumnTextFilter,
  applyColumnValuesFilter,
  toggleSortRule
} from "../../../core/collectionControls";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  applyReportTableControls,
  applyColumnFilterOpen,
  ReportTableHead,
  useReportTableControls
} from "../reportTableControls";
import { TablePagination } from "./TablePagination";
import { resolveColumnFilterOptions } from "./tableFilterOptions";
import type { GenericTableProps } from "./types";

const minimumColumnWidth = 96;
const columnWidthsStoragePrefix = "ownerlens:tableColumnWidths:";

type ColumnWidthState = {
  storageKey?: string;
  widths: Record<string, number>;
};

type GenericTableViewProps<TRow> = Omit<GenericTableProps<TRow>, "mode"> & {
  mode?: "local" | "remote";
  rows: TRow[];
};

type RenderGenericTableViewProps<TRow> = Pick<
  GenericTableProps<TRow>,
  | "columnHelp"
  | "columnWidthsStorageKey"
  | "emptyMessage"
  | "fields"
  | "fieldRenderers"
  | "getRowKey"
  | "minWidthClassName"
  | "onPageChange"
  | "page"
  | "pageSize"
  | "selectionColumn"
  | "totalCount"
> & {
  controlledRows: TRow[];
  filterOptions: NonNullable<GenericTableProps<TRow>["filterOptions"]>;
  filters: NonNullable<GenericTableProps<TRow>["filters"]>;
  onFilterChange: (columnId: string, value: string) => void;
  onFilterOpenChange: (columnId: string, isOpen: boolean) => void;
  onObjectFieldFilterChange: (columnId: string, conditions: Array<{ fieldId: string; value: string }>) => void;
  onSortToggle: (columnId: string) => void;
  onValueFilterToggle: (columnId: string, value: string, checked: boolean) => void;
  onValuesFilterChange: (columnId: string, values: string[]) => void;
  openFilterColumnId: string | null;
  sortRules: NonNullable<GenericTableProps<TRow>["sortRules"]>;
};

export function GenericTableView<TRow>(props: GenericTableViewProps<TRow>) {
  if (props.mode === "remote") {
    return <RemoteGenericTableView {...props} />;
  }

  return <LocalGenericTableView {...props} />;
}

function LocalGenericTableView<TRow>({
  columnHelp,
  columnWidthsStorageKey,
  emptyMessage,
  fields,
  filterOptions: controlledFilterOptions,
  filters: controlledFilters,
  fieldRenderers,
  getRowKey,
  minWidthClassName,
  onFiltersChange,
  onPageChange,
  onSortRulesChange,
  page,
  pageSize,
  rows,
  selectionColumn,
  sortRules: controlledSortRules,
  totalCount
}: GenericTableViewProps<TRow>) {
  const localControls = useReportTableControls(rows, fields);
  const filters = controlledFilters ?? localControls.filters;
  const sortRules = controlledSortRules ?? localControls.sortRules;
  const tableControls = useMemo(
    () => applyReportTableControls(rows, fields, filters, sortRules),
    [fields, filters, rows, sortRules]
  );
  const setColumnFilter =
    onFiltersChange === undefined
      ? localControls.setColumnFilter
      : (columnId: string, value: string) => {
          onFiltersChange(applyColumnTextFilter(filters, columnId, value));
        };
  const setColumnValuesFilter =
    onFiltersChange === undefined
      ? localControls.setColumnValuesFilter
      : (columnId: string, values: string[]) => {
          onFiltersChange(applyColumnValuesFilter(filters, columnId, values));
        };
  const setColumnObjectFieldFilter =
    onFiltersChange === undefined
      ? localControls.setColumnObjectFieldFilter
      : (columnId: string, conditions: Array<{ fieldId: string; value: string }>) => {
          onFiltersChange(applyColumnObjectFieldFilter(filters, columnId, conditions));
        };
  const toggleColumnValueFilter =
    onFiltersChange === undefined
      ? localControls.toggleColumnValueFilter
      : (columnId: string, value: string, checked: boolean) => {
          onFiltersChange(applyColumnFilterValueToggle(filters, columnId, value, checked));
        };
  const toggleColumnSort =
    onSortRulesChange === undefined
      ? localControls.toggleColumnSort
      : (columnId: string) => {
          onSortRulesChange(toggleSortRule(sortRules, columnId));
        };
  const controlledRows = totalCount === undefined ? tableControls.controlledRows : rows;
  const filterOptions = resolveColumnFilterOptions(fields, controlledFilterOptions ?? tableControls.filterOptions);
  const openFilterColumnId = localControls.openFilterColumnId;
  const setColumnFilterOpen = localControls.setColumnFilterOpen;

  return (
    <RenderGenericTableView
      columnHelp={columnHelp}
      columnWidthsStorageKey={columnWidthsStorageKey}
      controlledRows={controlledRows}
      emptyMessage={emptyMessage}
      fields={fields}
      fieldRenderers={fieldRenderers}
      filterOptions={filterOptions}
      filters={filters}
      getRowKey={getRowKey}
      minWidthClassName={minWidthClassName}
      openFilterColumnId={openFilterColumnId}
      page={page}
      pageSize={pageSize}
      selectionColumn={selectionColumn}
      sortRules={sortRules}
      totalCount={totalCount}
      onFilterChange={setColumnFilter}
      onFilterOpenChange={setColumnFilterOpen}
      onObjectFieldFilterChange={setColumnObjectFieldFilter}
      onPageChange={onPageChange}
      onSortToggle={toggleColumnSort}
      onValueFilterToggle={toggleColumnValueFilter}
      onValuesFilterChange={setColumnValuesFilter}
    />
  );
}

function RemoteGenericTableView<TRow>({
  columnHelp,
  columnWidthsStorageKey,
  emptyMessage,
  fields,
  filterOptions: controlledFilterOptions,
  filters = {},
  fieldRenderers,
  getRowKey,
  minWidthClassName,
  onFiltersChange,
  onPageChange,
  onSortRulesChange,
  page,
  pageSize,
  rows,
  selectionColumn,
  sortRules = [],
  totalCount
}: GenericTableViewProps<TRow>) {
  const [openFilterColumnId, setOpenFilterColumnId] = useState<string | null>(null);
  const filterOptions = resolveColumnFilterOptions(fields, controlledFilterOptions ?? {});
  const setColumnFilterOpen = (columnId: string, isOpen: boolean) => {
    setOpenFilterColumnId((currentColumnId) => applyColumnFilterOpen(currentColumnId, columnId, isOpen));
  };

  return (
    <RenderGenericTableView
      columnHelp={columnHelp}
      columnWidthsStorageKey={columnWidthsStorageKey}
      controlledRows={rows}
      emptyMessage={emptyMessage}
      fields={fields}
      fieldRenderers={fieldRenderers}
      filterOptions={filterOptions}
      filters={filters}
      getRowKey={getRowKey}
      minWidthClassName={minWidthClassName}
      openFilterColumnId={openFilterColumnId}
      page={page}
      pageSize={pageSize}
      selectionColumn={selectionColumn}
      sortRules={sortRules}
      totalCount={totalCount}
      onFilterChange={(columnId, value) => {
        onFiltersChange?.(applyColumnTextFilter(filters, columnId, value));
      }}
      onFilterOpenChange={setColumnFilterOpen}
      onObjectFieldFilterChange={(columnId, conditions) => {
        onFiltersChange?.(applyColumnObjectFieldFilter(filters, columnId, conditions));
      }}
      onPageChange={onPageChange}
      onSortToggle={(columnId) => {
        onSortRulesChange?.(toggleSortRule(sortRules, columnId));
      }}
      onValueFilterToggle={(columnId, value, checked) => {
        onFiltersChange?.(applyColumnFilterValueToggle(filters, columnId, value, checked));
      }}
      onValuesFilterChange={(columnId, values) => {
        onFiltersChange?.(applyColumnValuesFilter(filters, columnId, values));
      }}
    />
  );
}

function RenderGenericTableView<TRow>({
  columnHelp,
  columnWidthsStorageKey,
  controlledRows,
  emptyMessage,
  fields,
  fieldRenderers,
  filterOptions,
  filters,
  getRowKey,
  minWidthClassName,
  onFilterChange,
  onFilterOpenChange,
  onObjectFieldFilterChange,
  onPageChange,
  onSortToggle,
  onValueFilterToggle,
  onValuesFilterChange,
  openFilterColumnId,
  page,
  pageSize,
  selectionColumn,
  sortRules,
  totalCount
}: RenderGenericTableViewProps<TRow>) {
  const [columnWidthState, setColumnWidthState] = useState<ColumnWidthState>(() => ({
    storageKey: columnWidthsStorageKey,
    widths: readStoredColumnWidths(columnWidthsStorageKey)
  }));
  const resizeStateRef = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const columns = useMemo(
    () => buildCollectionColumns(fields, { columnHelp, renderers: fieldRenderers }),
    [columnHelp, fields, fieldRenderers]
  );
  const resolvedPage = page ?? 1;
  const resolvedPageSize = pageSize ?? controlledRows.length;
  const resolvedTotalCount = totalCount ?? controlledRows.length;
  const columnWidths = columnWidthState.widths;
  const startColumnResize = useCallback((columnId: string, startX: number, startWidth: number) => {
    resizeStateRef.current = {
      columnId,
      startX,
      startWidth: Math.max(startWidth, minimumColumnWidth)
    };
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const resizeState = resizeStateRef.current;

      if (!resizeState) {
        return;
      }

      const nextWidth = Math.max(minimumColumnWidth, Math.round(resizeState.startWidth + event.clientX - resizeState.startX));

      setColumnWidthState((current) => {
        if (current.widths[resizeState.columnId] === nextWidth) {
          return current;
        }

        return {
          ...current,
          widths: {
            ...current.widths,
            [resizeState.columnId]: nextWidth
          }
        };
      });
    }

    function handlePointerUp() {
      resizeStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    setColumnWidthState({
      storageKey: columnWidthsStorageKey,
      widths: readStoredColumnWidths(columnWidthsStorageKey)
    });
  }, [columnWidthsStorageKey]);

  useEffect(() => {
    if (columnWidthState.storageKey !== columnWidthsStorageKey) {
      return;
    }

    writeStoredColumnWidths(columnWidthsStorageKey, columnWidthState.widths);
  }, [columnWidthsStorageKey, columnWidthState]);

  return (
    <TableContainer>
      <Table className={minWidthClassName}>
        <colgroup>
          {selectionColumn ? <col className="w-10 min-w-10" /> : null}
          {columns.map((column) => (
            <col
              key={column.id}
              style={columnWidths[column.id] ? { width: `${columnWidths[column.id]}px` } : undefined}
            />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {selectionColumn ? (
              <TableHead className="w-10 min-w-10 px-3">
                {selectionColumn.renderHeader(controlledRows)}
              </TableHead>
            ) : null}
            <ReportTableHead
              columns={columns}
              filterOptions={filterOptions}
              filters={filters}
              openFilterColumnId={openFilterColumnId}
              sortRules={sortRules}
              columnWidths={columnWidths}
              onFilterChange={onFilterChange}
              onFilterOpenChange={onFilterOpenChange}
              onObjectFieldFilterChange={onObjectFieldFilterChange}
              onResizeStart={startColumnResize}
              onValueFilterToggle={onValueFilterToggle}
              onValuesFilterChange={onValuesFilterChange}
              onSortToggle={onSortToggle}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {controlledRows.map((row) => {
            const rowKey = getRowKey(row);

            return (
              <TableRow key={rowKey}>
                {selectionColumn ? (
                  <TableCell className="w-10 min-w-10 px-3">{selectionColumn.renderCell(row)}</TableCell>
                ) : null}
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    style={columnWidths[column.id] ? { width: `${columnWidths[column.id]}px` } : undefined}
                  >
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {controlledRows.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">{emptyMessage}</div>
      ) : null}
      {onPageChange && resolvedTotalCount > resolvedPageSize ? (
        <TablePagination
          count={resolvedTotalCount}
          page={resolvedPage}
          pageSize={resolvedPageSize}
          onPageChange={onPageChange}
        />
      ) : null}
    </TableContainer>
  );
}

function readStoredColumnWidths(storageKey: string | undefined): Record<string, number> {
  if (!storageKey || typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(getColumnWidthsStorageKey(storageKey));

    if (!rawValue) {
      return {};
    }

    const parsedValue: unknown = JSON.parse(rawValue);

    if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedValue).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])
      )
    );
  } catch {
    return {};
  }
}

function writeStoredColumnWidths(storageKey: string | undefined, widths: Record<string, number>) {
  if (!storageKey || typeof window === "undefined") {
    return;
  }

  try {
    const resolvedStorageKey = getColumnWidthsStorageKey(storageKey);

    if (Object.keys(widths).length === 0) {
      window.localStorage.removeItem(resolvedStorageKey);
      return;
    }

    window.localStorage.setItem(resolvedStorageKey, JSON.stringify(widths));
  } catch {
    // Local storage can be unavailable in private or locked-down browser contexts.
  }
}

function getColumnWidthsStorageKey(storageKey: string): string {
  return `${columnWidthsStoragePrefix}${storageKey}`;
}
