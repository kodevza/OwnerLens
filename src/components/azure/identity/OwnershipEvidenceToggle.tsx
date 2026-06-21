import { cn } from "../../../lib/utils";

type OwnershipEvidenceToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function OwnershipEvidenceToggle({ checked, onCheckedChange }: OwnershipEvidenceToggleProps) {
  return (
    <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <span>Direct</span>
      <button
        type="button"
        aria-checked={checked}
        aria-label="Toggle ownership evidence option"
        className={cn(
          "inline-flex h-8 w-14 shrink-0 items-center rounded-full border border-slate-200 bg-white p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
          checked ? "bg-slate-50" : "bg-white"
        )}
        role="switch"
        onClick={() => onCheckedChange(!checked)}
      >
        <span
          className={cn(
            "block h-6 w-6 rounded-full bg-emerald-500 shadow-sm transition-transform",
            checked ? "translate-x-6" : "translate-x-0"
          )}
        />
      </button>
      <span>Azure RBAC</span>
    </div>
  );
}
