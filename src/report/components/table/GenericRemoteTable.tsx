import { useEffect, useMemo, useState } from "react";

import { getConfiguredFilterOptions } from "../../applyCollectionControls";
import type { ColumnFilters, SortRule } from "../../../core/collectionControls";
import { GenericTableView } from "./GenericTableView";
import { TableState } from "./TableState";
import { remapColumnFiltersForRuntime, remapSortRulesForRuntime } from "./tableRuntimeMapping";
import type { GenericRemoteTableProps, GenericTablePage, LoadState } from "./types";

export function GenericRemoteTable<TRow>({
  fields,
  initialFilters,
  initialPage,
  initialSortRules,
  loadPage,
  loadingMessage,
  onFiltersChange,
  onPageChange,
  onRuntimeControlsChange,
  onSortRulesChange,
  selectionColumn,
  ...tableProps
}: GenericRemoteTableProps<TRow>) {
  const [collection, setCollection] = useState<GenericTablePage<TRow> | null>(null);
  const [filters, setFilters] = useState<ColumnFilters>(() => initialFilters ?? {});
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [page, setPage] = useState(() => initialPage ?? 1);
  const [sortRules, setSortRules] = useState<SortRule[]>(() => initialSortRules ?? []);
  const runtimeFilters = useMemo(() => remapColumnFiltersForRuntime(fields, filters), [fields, filters]);
  const runtimeSortRules = useMemo(() => remapSortRulesForRuntime(fields, sortRules), [fields, sortRules]);

  useEffect(() => {
    onRuntimeControlsChange?.({
      filters: runtimeFilters,
      sortRules: runtimeSortRules
    });
  }, [onRuntimeControlsChange, runtimeFilters, runtimeSortRules]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCollectionPage() {
      setLoadState({ status: "loading" });

      try {
        const nextCollection = await loadPage({
          filters: runtimeFilters,
          page,
          signal: controller.signal,
          sortRules: runtimeSortRules
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
  }, [loadPage, page, runtimeFilters, runtimeSortRules]);

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
        selectionColumn={selectionColumn}
        sortRules={sortRules}
        totalCount={collection.count}
        onFiltersChange={(nextFilters) => {
          setPage(1);
          setFilters(nextFilters);
          onFiltersChange?.(nextFilters);
          onPageChange?.(1);
        }}
        onPageChange={(nextPage) => {
          setPage(nextPage);
          onPageChange?.(nextPage);
        }}
        onSortRulesChange={(nextSortRules) => {
          setPage(1);
          setSortRules(nextSortRules);
          onPageChange?.(1);
          onSortRulesChange?.(nextSortRules);
        }}
      />
    </>
  );
}
