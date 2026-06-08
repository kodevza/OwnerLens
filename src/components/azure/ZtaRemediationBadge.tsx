import type { ZtaRemediationSummary } from "../../core/azure/ztaReport";
import { cn } from "../../lib/utils";
import { Badge, type BadgeProps } from "../../report/components/ui/badge";

type ZtaRemediationBadgeProps = Pick<
  ZtaRemediationSummary,
  "ztaMaxRisk" | "ztaRemediationCountAll" | "ztaRemediationFailedCount"
> & {
  onClick?: () => void;
};

export function ZtaRemediationBadge({
  onClick,
  ztaMaxRisk,
  ztaRemediationCountAll,
  ztaRemediationFailedCount
}: ZtaRemediationBadgeProps) {
  const content = `${ztaRemediationFailedCount}/${ztaRemediationCountAll}`;
  const variant = getZtaRiskVariant(ztaMaxRisk);

  if (onClick) {
    return (
      <button
        aria-label={`Open ZTA remediations ${content}`}
        className={cn(
          "inline-flex min-w-12 items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          getZtaRiskClassName(ztaMaxRisk)
        )}
        type="button"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <Badge className="min-w-12 justify-center tabular-nums" variant={variant}>
      {content}
    </Badge>
  );
}

function getZtaRiskClassName(ztaMaxRisk: ZtaRemediationSummary["ztaMaxRisk"]): string {
  switch (ztaMaxRisk) {
    case "high":
      return "border-transparent bg-red-100 text-red-800";
    case "medium":
      return "border-transparent bg-amber-100 text-amber-800";
    case "low":
      return "border-transparent bg-emerald-100 text-emerald-800";
    case "none":
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

function getZtaRiskVariant(ztaMaxRisk: ZtaRemediationSummary["ztaMaxRisk"]): BadgeProps["variant"] {
  switch (ztaMaxRisk) {
    case "high":
      return "riskHigh";
    case "medium":
      return "riskMedium";
    case "low":
      return "riskLow";
    case "none":
    default:
      return "riskNone";
  }
}
