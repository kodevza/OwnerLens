import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { TableHead } from "./ui/table";
import type { ReportColumnHelp, ReportFieldDescriptor } from "../reportTypes";
import {
  applyCollectionControls,
  type ColumnFilter,
  type ColumnFilterOptions,
  type ColumnFilters,
  type SortRule
} from "../applyCollectionControls";

export type { ColumnFilter, ColumnFilterOptions, ColumnFilters, SortRule } from "../applyCollectionControls";

export type ReportTableColumn<TRow> = {
  id: string;
  label: string;
  className?: string;
  filter?: "auto" | "text" | "multiselect";
  help?: ReportColumnHelp;
  render: (row: TRow) => ReactNode;
};

const maxMultiselectOptions = 5;
const tooltipWidth = 320;
const tooltipGap = 8;
const dropdownGap = 4;
const dropdownEstimatedHeight = 272;
const viewportMargin = 16;

export function useReportTableControls<TRow>(rows: TRow[], fields: ReportFieldDescriptor<TRow>[]) {
  const [filters, setFilters] = useState<ColumnFilters>({});
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [openFilterColumnId, setOpenFilterColumnId] = useState<string | null>(null);

  const { controlledRows, filterOptions } = useMemo(
    () => applyReportTableControls(rows, fields, filters, sortRules),
    [fields, filters, rows, sortRules]
  );

  function setColumnFilter(columnId: string, value: string) {
    setFilters((current) => {
      const next = { ...current };

      if (value.trim().length === 0) {
        delete next[columnId];
      } else {
        next[columnId] = { type: "text", value };
      }

      return next;
    });
  }

  function setColumnValuesFilter(columnId: string, values: string[]) {
    setFilters((current) => applyColumnValuesFilter(current, columnId, values));
  }

  function toggleColumnValueFilter(columnId: string, value: string, checked: boolean) {
    setFilters((current) => applyColumnFilterValueToggle(current, columnId, value, checked));
  }

  function setColumnFilterOpen(columnId: string, isOpen: boolean) {
    setOpenFilterColumnId((currentColumnId) => applyColumnFilterOpen(currentColumnId, columnId, isOpen));
  }

  function toggleColumnSort(columnId: string) {
    setSortRules((current) => {
      const existingRule = current.find((rule) => rule.columnId === columnId);

      if (!existingRule) {
        return [...current, { columnId, direction: "asc" }];
      }

      if (existingRule.direction === "asc") {
        return current.map((rule) => (rule.columnId === columnId ? { ...rule, direction: "desc" } : rule));
      }

      return current.filter((rule) => rule.columnId !== columnId);
    });
  }

  return {
    controlledRows,
    filterOptions,
    filters,
    openFilterColumnId,
    setColumnFilter,
    setColumnFilterOpen,
    setColumnValuesFilter,
    sortRules,
    toggleColumnValueFilter,
    toggleColumnSort
  };
}

export function applyReportTableControls<TRow>(
  rows: TRow[],
  fields: ReportFieldDescriptor<TRow>[],
  filters: ColumnFilters,
  sortRules: SortRule[] = []
) {
  return applyCollectionControls(rows, fields, {
    filters,
    sortRules
  });
}

export function applyColumnValuesFilter(
  currentFilters: ColumnFilters,
  columnId: string,
  values: string[]
): ColumnFilters {
  const next = { ...currentFilters };

  if (values.length === 0) {
    delete next[columnId];
  } else {
    next[columnId] = { type: "values", values };
  }

  return next;
}

export function applyColumnFilterValueToggle(
  currentFilters: ColumnFilters,
  columnId: string,
  value: string,
  checked: boolean
): ColumnFilters {
  const currentFilter = currentFilters[columnId];
  const selectedValues = currentFilter?.type === "values" ? currentFilter.values : [];

  return applyColumnValuesFilter(currentFilters, columnId, applyColumnValueToggle(selectedValues, value, checked));
}

export function applyColumnFilterOpen(
  currentColumnId: string | null,
  columnId: string,
  isOpen: boolean
): string | null {
  if (isOpen) {
    return columnId;
  }

  return currentColumnId === columnId ? null : currentColumnId;
}

export function applyColumnValueToggle(selectedValues: string[], value: string, checked: boolean): string[] {
  if (checked) {
    return selectedValues.includes(value) ? selectedValues : [...selectedValues, value];
  }

  return selectedValues.filter((selectedValue) => selectedValue !== value);
}

export function ReportTableHead<TRow>({
  columns,
  filters,
  filterOptions,
  openFilterColumnId,
  sortRules,
  onFilterChange,
  onFilterOpenChange,
  onValueFilterToggle,
  onValuesFilterChange,
  onSortToggle
}: {
  columns: ReportTableColumn<TRow>[];
  filters: ColumnFilters;
  filterOptions: ColumnFilterOptions;
  openFilterColumnId: string | null;
  sortRules: SortRule[];
  onFilterChange: (columnId: string, value: string) => void;
  onFilterOpenChange: (columnId: string, isOpen: boolean) => void;
  onValueFilterToggle: (columnId: string, value: string, checked: boolean) => void;
  onValuesFilterChange: (columnId: string, values: string[]) => void;
  onSortToggle: (columnId: string) => void;
}) {
  return (
    <>
      {columns.map((column) => {
        const sortIndex = sortRules.findIndex((rule) => rule.columnId === column.id);
        const sortRule = sortIndex >= 0 ? sortRules[sortIndex] : null;
        const sortMark = sortRule ? (sortRule.direction === "asc" ? "↑" : "↓") : "↕";
        const options = filterOptions[column.id] ?? [];
        const filter = filters[column.id];
        const shouldUseMultiselect =
          column.filter === "multiselect" ||
          (column.filter !== "text" && options.length > 0 && options.length <= maxMultiselectOptions);

        return (
          <TableHead key={column.id} className={column.className}>
            <div className="flex min-w-[132px] flex-col gap-1.5">
              <div className="flex items-start justify-between gap-1 py-1">
                <button
                  aria-label={`Sort by ${column.label}`}
                  className="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-1 rounded-sm border-0 bg-transparent p-0 text-left text-xs font-semibold text-foreground"
                  type="button"
                  onClick={() => onSortToggle(column.id)}
                >
                  <span className="truncate">{column.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    {sortRule ? <span>{sortIndex + 1}</span> : null}
                    <span aria-hidden="true">{sortMark}</span>
                  </span>
                </button>
                {column.help ? <ColumnInfo label={column.label} help={column.help} /> : null}
              </div>
              {shouldUseMultiselect ? (
                <ColumnValueFilter
                  column={column}
                  filter={filter}
                  isOpen={openFilterColumnId === column.id}
                  options={options}
                  onClear={onValuesFilterChange}
                  onOpenChange={onFilterOpenChange}
                  onValueToggle={onValueFilterToggle}
                />
              ) : (
                <Input
                  aria-label={`Filter ${column.label}`}
                  className="h-7 min-w-0 bg-card px-1.5 py-1 text-xs shadow-none"
                  placeholder="Filter with RegExp"
                  value={filter?.type === "text" ? filter.value : ""}
                  onChange={(event) => onFilterChange(column.id, event.target.value)}
                />
              )}
            </div>
          </TableHead>
        );
      })}
    </>
  );
}

function ColumnInfo({ label, help }: { label: string; help: ReportColumnHelp }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);

  function showTooltip() {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const maxLeft = window.innerWidth - tooltipWidth - viewportMargin;
    const preferredLeft = rect.right - tooltipWidth;
    const left = Math.max(viewportMargin, Math.min(preferredLeft, maxLeft));
    const preferredTop = rect.bottom + tooltipGap;
    const top =
      preferredTop + tooltipGap > window.innerHeight
        ? Math.max(viewportMargin, rect.top - tooltipGap)
        : preferredTop;

    setTooltipPosition({ left, top });
  }

  function hideTooltip() {
    setTooltipPosition(null);
  }

  return (
    <span className="inline-flex shrink-0" onBlur={hideTooltip} onFocus={showTooltip} onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      <span
        ref={triggerRef}
        aria-label={`${label} column information`}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-input bg-card text-[10px] font-semibold leading-none text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="button"
        tabIndex={0}
      >
        i
      </span>
      {tooltipPosition
        ? createPortal(
            <ColumnInfoTooltip help={help} label={label} left={tooltipPosition.left} top={tooltipPosition.top} />,
            document.body
          )
        : null}
    </span>
  );
}

function ColumnInfoTooltip({
  label,
  help,
  left,
  top
}: {
  label: string;
  help: ReportColumnHelp;
  left: number;
  top: number;
}) {
  const logic = help.logic ?? [];

  return (
    <span
      className="pointer-events-none fixed z-[100] block w-80 max-w-[calc(100vw-2rem)] whitespace-normal rounded-md border border-border bg-card p-3 text-left text-xs font-normal leading-5 text-foreground shadow-lg"
      role="tooltip"
      style={{ left, top }}
    >
      <span className="mb-2 block font-semibold text-foreground">{label}</span>
      <span className="block">
        <span className="font-semibold text-muted-foreground">Source: </span>
        {help.source}
      </span>
      {help.field ? (
        <span className="block">
          <span className="font-semibold text-muted-foreground">Attribute: </span>
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{help.field}</code>
        </span>
      ) : null}
      <span className="mt-2 block font-semibold text-muted-foreground">Logic:</span>
      <ul className="m-0 mt-1 list-disc space-y-1 pl-4">
        {logic.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </span>
  );
}

function ColumnValueFilter<TRow>({
  column,
  filter,
  isOpen,
  options,
  onClear,
  onOpenChange,
  onValueToggle
}: {
  column: ReportTableColumn<TRow>;
  filter: ColumnFilter | undefined;
  isOpen: boolean;
  options: string[];
  onClear: (columnId: string, values: string[]) => void;
  onOpenChange: (columnId: string, isOpen: boolean) => void;
  onValueToggle: (columnId: string, value: string, checked: boolean) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
    minWidth: number;
    maxWidth: number;
  } | null>(null);
  const selectedValues = filter?.type === "values" ? filter.values : [];
  const label =
    selectedValues.length === 0
      ? "All"
      : selectedValues.length === 1
        ? selectedValues[0]
        : `${selectedValues.length} selected`;

  function toggleValue(value: string, checked: boolean) {
    onValueToggle(column.id, value, checked);
  }

  function updateMenuPosition() {
    const trigger = triggerRef.current;
    if (!trigger) {
      setMenuPosition(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const maxWidth = window.innerWidth - viewportMargin * 2;
    const minWidth = Math.min(Math.max(rect.width, 160), maxWidth);
    const preferredLeft = rect.left;
    const maxLeft = window.innerWidth - minWidth - viewportMargin;
    const left = Math.max(viewportMargin, Math.min(preferredLeft, maxLeft));
    const preferredTop = rect.bottom + dropdownGap;
    const top =
      preferredTop + dropdownEstimatedHeight > window.innerHeight && rect.top > dropdownEstimatedHeight
        ? Math.max(viewportMargin, rect.top - dropdownGap - dropdownEstimatedHeight)
        : preferredTop;

    setMenuPosition({ left, top, minWidth, maxWidth });
  }

  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        aria-label={`Filter ${column.label}`}
        className="h-7 w-full cursor-pointer list-none justify-between gap-1 bg-card px-1.5 py-1 font-normal shadow-sm marker:hidden"
        size="sm"
        type="button"
        variant="outline"
        onClick={() => onOpenChange(column.id, !isOpen)}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden="true" className="text-muted-foreground">
          ▾
        </span>
      </Button>
      {isOpen && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[100] rounded-md border border-border bg-card p-2 text-xs text-foreground shadow-lg"
              style={{
                left: menuPosition.left,
                top: menuPosition.top,
                minWidth: menuPosition.minWidth,
                maxWidth: menuPosition.maxWidth
              }}
            >
              <Button
                className="mb-1 w-full cursor-pointer justify-start px-2 py-1 text-left text-xs text-muted-foreground"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => onClear(column.id, [])}
              >
                Clear
              </Button>
              <div className="flex max-h-52 flex-col gap-1 overflow-auto">
                {options.map((option) => (
                  <label key={option} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-muted">
                    <input
                      checked={selectedValues.includes(option)}
                      className="h-3.5 w-3.5"
                      type="checkbox"
                      onChange={(event) => toggleValue(option, event.target.checked)}
                    />
                    <span className="break-words">{option}</span>
                  </label>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
