import { useCallback, useState, type ReactNode } from "react";

import type { CsvExportSelection } from "./api";
import { SelectionActionBar } from "../../report/components/SelectionActionBar";
import { Button } from "../../report/components/ui/button";

type CsvSelectionActionBarProps = CsvExportSelection & {
  children?: ReactNode;
  itemLabel: string;
  onExportCsv: (selection: CsvExportSelection) => Promise<void>;
};

export function CsvSelectionActionBar({
  children,
  filters,
  itemLabel,
  selectAllMatchingFilters,
  selectedRowKeys,
  sortRules,
  onExportCsv
}: CsvSelectionActionBarProps) {
  const [exportState, setExportState] = useState<{
    status: "idle" | "exporting" | "error";
    message?: string;
  }>({ status: "idle" });
  const exportCsv = useCallback(async () => {
    setExportState({ status: "exporting" });

    try {
      await onExportCsv({ filters, selectAllMatchingFilters, selectedRowKeys, sortRules });
      setExportState({ status: "idle" });
    } catch (error) {
      setExportState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not export CSV."
      });
    }
  }, [filters, onExportCsv, selectAllMatchingFilters, selectedRowKeys, sortRules]);
  const selectionLabel = selectAllMatchingFilters ? `all filtered ${itemLabel}` : `${selectedRowKeys.length} selected ${itemLabel}`;
  const isExporting = exportState.status === "exporting";

  return (
    <SelectionActionBar errorMessage={exportState.status === "error" ? exportState.message : undefined}>
      {children}
      <Button
        aria-label={`Export ${selectionLabel} to CSV`}
        disabled={isExporting}
        type="button"
        onClick={() => {
          void exportCsv();
        }}
      >
        {isExporting ? "Exporting..." : "Export CSV"}
      </Button>
    </SelectionActionBar>
  );
}
