import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  GenericRemoteTable,
  GenericTableView,
  isRemoteTableProps,
  type GenericTableSelectionColumn,
  type GenericTableWrapperProps
} from "./GenericTable";
import type { ColumnFilters } from "../../core/collectionControls";

type SelectionOverlayContext = {
  filters: ColumnFilters;
  selectedRowKeys: string[];
};

type SelectableGenericTableProps<TRow> = GenericTableWrapperProps<TRow> & {
  defaultSelectedRowKeys?: string[];
  getRowSelectionLabel?: (row: TRow) => string;
  onSelectionChange?: (selectedRowKeys: string[]) => void;
  renderSelectionOverlay?: (context: SelectionOverlayContext) => ReactNode;
  selectedRowKeys?: string[];
  selectionColumnLabel?: string;
};

export function SelectableGenericTable<TRow>(props: SelectableGenericTableProps<TRow>) {
  const {
    defaultSelectedRowKeys,
    getRowSelectionLabel,
    onSelectionChange,
    renderSelectionOverlay,
    selectedRowKeys,
    selectionColumnLabel = "Select",
    ...tableProps
  } = props;
  const { getRowKey } = tableProps;
  const [uncontrolledSelectedRowKeys, setUncontrolledSelectedRowKeys] = useState<string[]>(
    () => defaultSelectedRowKeys ?? []
  );
  const resolvedSelectedRowKeys = selectedRowKeys ?? uncontrolledSelectedRowKeys;
  const selectedRowKeySet = useMemo(() => new Set(resolvedSelectedRowKeys), [resolvedSelectedRowKeys]);
  const [selectionFilters, setSelectionFilters] = useState<ColumnFilters>(() =>
    isRemoteTableProps(tableProps) ? (tableProps.initialFilters ?? {}) : (tableProps.filters ?? {})
  );

  const emitSelectionChange = useCallback(
    (nextSelectedRowKeys: string[]) => {
      if (selectedRowKeys === undefined) {
        setUncontrolledSelectedRowKeys(nextSelectedRowKeys);
      }

      onSelectionChange?.(nextSelectedRowKeys);
    },
    [onSelectionChange, selectedRowKeys]
  );
  const selectionOverlay =
    renderSelectionOverlay && resolvedSelectedRowKeys.length > 0
      ? renderSelectionOverlay({ filters: selectionFilters, selectedRowKeys: resolvedSelectedRowKeys })
      : null;

  const selectionColumn = useMemo<GenericTableSelectionColumn<TRow>>(
    () => ({
      renderHeader: (visibleRows) => {
        const visibleRowKeys = visibleRows.map(getRowKey);
        const selectedVisibleRowCount = visibleRowKeys.filter((rowKey) => selectedRowKeySet.has(rowKey)).length;
        const areAllVisibleRowsSelected =
          visibleRowKeys.length > 0 && selectedVisibleRowCount === visibleRowKeys.length;
        const areSomeVisibleRowsSelected = selectedVisibleRowCount > 0 && !areAllVisibleRowsSelected;

        return (
          <SelectionCheckbox
            checked={areAllVisibleRowsSelected}
            disabled={visibleRowKeys.length === 0}
            indeterminate={areSomeVisibleRowsSelected}
            label={selectionColumnLabel}
            onChange={(selected) => {
              const nextSelectedRowKeys = new Set(selectedRowKeySet);

              for (const rowKey of visibleRowKeys) {
                if (selected) {
                  nextSelectedRowKeys.add(rowKey);
                } else {
                  nextSelectedRowKeys.delete(rowKey);
                }
              }

              emitSelectionChange([...nextSelectedRowKeys]);
            }}
          />
        );
      },
      renderCell: (row) => {
        const rowKey = getRowKey(row);

        return (
          <SelectionCheckbox
            checked={selectedRowKeySet.has(rowKey)}
            label={getRowSelectionLabel?.(row) ?? `Select row ${rowKey}`}
            onChange={(selected) => {
              const nextSelectedRowKeys = new Set(selectedRowKeySet);

              if (selected) {
                nextSelectedRowKeys.add(rowKey);
              } else {
                nextSelectedRowKeys.delete(rowKey);
              }

              emitSelectionChange([...nextSelectedRowKeys]);
            }}
          />
        );
      }
    }),
    [emitSelectionChange, getRowKey, getRowSelectionLabel, selectedRowKeySet, selectionColumnLabel]
  );

  if (isRemoteTableProps(tableProps)) {
    const handleFiltersChange = (nextFilters: ColumnFilters) => {
      setSelectionFilters(nextFilters);
      tableProps.onFiltersChange?.(nextFilters);
    };

    return (
      <div className="mb-[150px]">
        <GenericRemoteTable
          {...tableProps}
          getRowKey={getRowKey}
          selectionColumn={selectionColumn}
          onFiltersChange={handleFiltersChange}
        />
        {selectionOverlay}
      </div>
    );
  }

  const handleFiltersChange = (nextFilters: ColumnFilters) => {
    setSelectionFilters(nextFilters);
    tableProps.onFiltersChange?.(nextFilters);
  };

  return (
    <div className="mb-[150px]">
      <GenericTableView
        {...tableProps}
        filters={tableProps.filters ?? selectionFilters}
        getRowKey={getRowKey}
        onFiltersChange={handleFiltersChange}
        rows={tableProps.rows ?? []}
        selectionColumn={selectionColumn}
      />
      {selectionOverlay}
    </div>
  );
}

function SelectionCheckbox({
  checked,
  disabled,
  indeterminate,
  label,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate ?? false;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      aria-label={label}
      checked={checked}
      className="h-4 w-4"
      disabled={disabled}
      type="checkbox"
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
