import type { ReactNode } from "react";

import type { ColumnFilterOptions, ColumnFilters, SortRule } from "../../../core/collectionControls";
import type { ReportColumnRenderers } from "../../buildCollectionColumns";
import type { ReportColumnHelp, ReportFieldDescriptor } from "../../reportTypes";

export type GenericTableSelectionColumn<TRow> = {
  renderCell: (row: TRow) => ReactNode;
  renderHeader: (visibleRows: TRow[]) => ReactNode;
};

export type GenericTableProps<TRow> = {
  columnHelp?: Record<string, ReportColumnHelp>;
  columnWidthsStorageKey?: string;
  emptyMessage: string;
  fields: ReportFieldDescriptor<TRow>[];
  filterOptions?: ColumnFilterOptions;
  filters?: ColumnFilters;
  fieldRenderers?: ReportColumnRenderers<TRow>;
  getRowKey: (row: TRow) => string;
  minWidthClassName: string;
  mode?: "local";
  onFiltersChange?: (filters: ColumnFilters) => void;
  onPageChange?: (page: number) => void;
  onSortRulesChange?: (sortRules: SortRule[]) => void;
  page?: number;
  pageSize?: number;
  rows?: TRow[];
  selectionColumn?: GenericTableSelectionColumn<TRow>;
  sortRules?: SortRule[];
  totalCount?: number;
};

export type GenericTablePage<TRow> = {
  rows: TRow[];
  page: number;
  pageSize: number;
  count: number;
};

export type GenericRemoteTableProps<TRow> = Omit<
  GenericTableProps<TRow>,
  | "filterOptions"
  | "filters"
  | "mode"
  | "onFiltersChange"
  | "onPageChange"
  | "page"
  | "rows"
  | "sortRules"
  | "totalCount"
> & {
  initialFilters?: ColumnFilters;
  initialPage?: number;
  initialSortRules?: SortRule[];
  loadPage: (input: {
    filters: ColumnFilters;
    page: number;
    signal: AbortSignal;
    sortRules: SortRule[];
  }) => Promise<GenericTablePage<TRow>>;
  loadingMessage: string;
  mode?: "remote";
  onFiltersChange?: (filters: ColumnFilters) => void;
  onPageChange?: (page: number) => void;
  onRuntimeControlsChange?: (controls: { filters: ColumnFilters; sortRules: SortRule[] }) => void;
  onSortRulesChange?: (sortRules: SortRule[]) => void;
};

export type GenericTableWrapperProps<TRow> = GenericTableProps<TRow> | GenericRemoteTableProps<TRow>;

export type LoadState =
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
