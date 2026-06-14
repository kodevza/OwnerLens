import type { ZtaRemediationSummary } from "../../core/azure/ztaReport";
import { Badge, type BadgeProps } from "../../report/components/ui/badge";

type ZtaRemediationBadgeProps = Pick<
  ZtaRemediationSummary,
  "ztaMaxRisk" | "ztaRemediationCountAll" | "ztaRemediationFailedCount"
> & {
  onClick?: () => void;
};

const ztaRemediationBadgeTypographyClassName = "font-sans text-xs font-semibold tabular-nums";
const ztaRemediationBadgeButtonClassName = `rounded-full ${ztaRemediationBadgeTypographyClassName} transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;

export function ZtaRemediationBadge({
  onClick,
  ztaMaxRisk,
  ztaRemediationCountAll,
  ztaRemediationFailedCount
}: ZtaRemediationBadgeProps) {
  const content = `${ztaRemediationFailedCount}/${ztaRemediationCountAll}`;
  const variant = getZtaRiskVariant(ztaMaxRisk);
  const badge = (
    <Badge className={`min-w-12 justify-center ${ztaRemediationBadgeTypographyClassName}`} variant={variant}>
      {content}
    </Badge>
  );

  if (onClick) {
    return (
      <button
        aria-label={`Open ZTA remediations ${content}`}
        className={ztaRemediationBadgeButtonClassName}
        type="button"
        onClick={onClick}
      >
        {badge}
      </button>
    );
  }

  return badge;
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
