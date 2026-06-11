import { useEffect, useMemo, useState } from "react";

import { buildCollectionColumns, type ReportColumnRenderers } from "../buildCollectionColumns";
import { getConfiguredFilterOptions } from "../applyCollectionControls";
import type { ReportColumnHelp, ReportFieldDescriptor } from "../reportTypes";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Table, TableBody, TableCell, TableContainer, TableHeader, TableRow } from "./ui/table";
import {
  applyColumnFilterValueToggle,
  applyColumnValuesFilter,
  applyReportTableControls,
  ReportTableHead,
  type ColumnFilterOptions,
  type ColumnFilters,
  type SortRule,
  useReportTableControls
} from "./reportTableControls";

type GenericTableProps<TRow> = {
  columnHelp?: Record<string, ReportColumnHelp>;
  emptyMessage: string;
  fields: ReportFieldDescriptor<TRow>[];
  filterOptions?: ColumnFilterOptions;
  filters?: ColumnFilters;
  fieldRenderers?: ReportColumnRenderers<TRow>;
  getRowKey: (row: TRow) => string;
  minWidthClassName: string;
  onFiltersChange?: (filters: ColumnFilters) => void;
  onPageChange?: (page: number) => void;
  onSortRulesChange?: (sortRules: SortRule[]) => void;
  page?: number;
  pageSize?: number;
  rows?: TRow[];
  sortRules?: SortRule[];
  totalCount?: number;
};

type GenericTablePage<TRow> = {
  rows: TRow[];
  page: number;
  pageSize: number;
  count: number;
};

type GenericRemoteTableProps<TRow> = Omit<
  GenericTableProps<TRow>,
  "filterOptions" | "filters" | "onFiltersChange" | "onPageChange" | "page" | "rows" | "sortRules" | "totalCount"
> & {
  initialFilters?: ColumnFilters;
  loadPage: (input: { filters: ColumnFilters; page: number; signal: AbortSignal }) => Promise<GenericTablePage<TRow>>;
  loadingMessage: string;
};

type GenericTableWrapperProps<TRow> = GenericTableProps<TRow> | GenericRemoteTableProps<TRow>;

type LoadState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
    }
  | {
      status: "error";
      message: string;
    };

function isRemoteTableProps<TRow>(props: GenericTableWrapperProps<TRow>): props is GenericRemoteTableProps<TRow> {
  return "loadPage" in props;
}

export function GenericTable<TRow>(props: GenericTableWrapperProps<TRow>) {
  if (isRemoteTableProps(props)) {
    return <GenericRemoteTable {...props} />;
  }

  return <GenericTableView {...props} rows={props.rows ?? []} />;
}

function GenericRemoteTable<TRow>({
  fields,
  initialFilters,
  loadPage,
  loadingMessage,
  ...tableProps
}: GenericRemoteTableProps<TRow>) {
  const [collection, setCollection] = useState<GenericTablePage<TRow> | null>(null);
  const [filters, setFilters] = useState<ColumnFilters>(() => initialFilters ?? {});
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCollectionPage() {
      setLoadState({ status: "loading" });

      try {
        const nextCollection = await loadPage({
          filters: remapColumnFiltersForRuntime(fields, filters),
          page,
          signal: controller.signal
        });
        setCollection(nextCollection);
        setLoadState({ status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCollection(null);
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load table data."
        });
      }
    }

    loadCollectionPage();

    return () => controller.abort();
  }, [fields, filters, loadPage, page]);

  const filterOptions = useMemo(() => getConfiguredFilterOptions(fields), [fields]);

  if (!collection && loadState.status === "loading") {
    return <TableState>{loadingMessage}</TableState>;
  }

  if (!collection && loadState.status === "error") {
    return <TableState variant="error">{loadState.message}</TableState>;
  }

  if (!collection) {
    return null;
  }

  return (
    <>
      {loadState.status === "error" ? <TableState variant="error">{loadState.message}</TableState> : null}
      <GenericTableView
        {...tableProps}
        emptyMessage={loadState.status === "loading" ? loadingMessage : tableProps.emptyMessage}
        fields={fields}
        filterOptions={filterOptions}
        filters={filters}
        page={collection.page}
        pageSize={collection.pageSize}
        rows={collection.rows}
        sortRules={[]}
        totalCount={collection.count}
        onFiltersChange={(nextFilters) => {
          setPage(1);
          setFilters(nextFilters);
        }}
        onPageChange={setPage}
        onSortRulesChange={() => undefined}
      />
    </>
  );
}

function GenericTableView<TRow>({
  columnHelp,
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
  sortRules: controlledSortRules,
  totalCount
}: GenericTableProps<TRow> & { rows: TRow[] }) {
  const columns = useMemo(
    () => buildCollectionColumns(fields, { columnHelp, renderers: fieldRenderers }),
    [columnHelp, fields, fieldRenderers]
  );
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
  const resolvedPage = page ?? 1;
  const resolvedPageSize = pageSize ?? controlledRows.length;
  const resolvedTotalCount = totalCount ?? controlledRows.length;

  return (
    <TableContainer>
      <Table className={minWidthClassName}>
        <TableHeader>
          <TableRow>
            <ReportTableHead
              columns={columns}
              filterOptions={filterOptions}
              filters={filters}
              openFilterColumnId={openFilterColumnId}
              sortRules={sortRules}
              onFilterChange={setColumnFilter}
              onFilterOpenChange={setColumnFilterOpen}
              onValueFilterToggle={toggleColumnValueFilter}
              onValuesFilterChange={setColumnValuesFilter}
              onSortToggle={toggleColumnSort}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {controlledRows.map((row) => (
            <TableRow key={getRowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.id}>{column.render(row)}</TableCell>
              ))}
            </TableRow>
          ))}
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

function remapColumnFiltersForRuntime<TRow>(
  fields: ReportFieldDescriptor<TRow>[],
  filters: ColumnFilters
): ColumnFilters {
  const filterColumnByFieldId = new Map(fields.map((field) => [field.id, field.filterColumnId ?? field.id]));
  const next: ColumnFilters = {};

  for (const [columnId, filter] of Object.entries(filters)) {
    next[filterColumnByFieldId.get(columnId) ?? columnId] = filter;
  }

  return next;
}

function resolveColumnFilterOptions<TRow>(
  fields: ReportFieldDescriptor<TRow>[],
  filterOptions: ColumnFilterOptions
): ColumnFilterOptions {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      filterOptions[field.id] ?? (field.filterColumnId ? filterOptions[field.filterColumnId] : undefined) ?? []
    ])
  );
}

function TableState({ children, variant = "empty" }: { children: string; variant?: "empty" | "error" }) {
  return (
    <Card
      className={
        variant === "error"
          ? "border-red-200 bg-red-50 p-4 text-sm text-red-900"
          : "p-8 text-center text-sm text-muted-foreground"
      }
    >
      {children}
    </Card>
  );
}

function applyColumnTextFilter(filters: ColumnFilters, columnId: string, value: string): ColumnFilters {
  const next = { ...filters };

  if (value.trim()) {
    next[columnId] = { type: "text", value };
  } else {
    delete next[columnId];
  }

  return next;
}

function toggleSortRule(sortRules: SortRule[], columnId: string): SortRule[] {
  const existingRule = sortRules.find((rule) => rule.columnId === columnId);

  if (!existingRule) {
    return [...sortRules, { columnId, direction: "asc" }];
  }

  if (existingRule.direction === "asc") {
    return sortRules.map((rule) => (rule.columnId === columnId ? { ...rule, direction: "desc" } : rule));
  }

  return sortRules.filter((rule) => rule.columnId !== columnId);
}

function TablePagination({
  count,
  page,
  pageSize,
  onPageChange
}: {
  count: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="flex items-center justify-end gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        Page {page} of {pageCount}
      </span>
      <Button
        disabled={page <= 1}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <Button
        disabled={page >= pageCount}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
