import { X } from "lucide-react";

import { cn } from "../../lib/utils";
import { TabsTrigger } from "./ui/tabs";

type ClosableTabProps = {
  active: boolean;
  closeLabel: string;
  label: string;
  onClose: () => void;
  value: string;
};

export function ClosableTab({ active, closeLabel, label, onClose, value }: ClosableTabProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 max-w-full items-center overflow-hidden rounded-t-sm rounded-b-none border border-transparent border-b-border bg-muted/70 transition-colors hover:bg-muted",
        active && "border-border border-b-card bg-card"
      )}
    >
      <TabsTrigger
        className="min-w-0 max-w-64 flex-1 justify-start overflow-hidden rounded-r-none border-0 bg-transparent pr-2 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        value={value}
      >
        <span className="truncate">{label}</span>
      </TabsTrigger>
      <button
        aria-label={closeLabel}
        className={cn(
          "mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground"
        )}
        title={closeLabel}
        type="button"
        onClick={onClose}
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
