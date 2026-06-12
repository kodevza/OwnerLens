import type { ZtaRemediationPackageSummary, ZtaReportTest } from "../../core/azure/ztaReport";
import { formatDate, formatValue } from "../../lib/utils";
import { Badge } from "../../report/components/ui/badge";

export function ZtaRemediationPackageBadges({
  packages,
  onRemediationPackageClick
}: {
  packages: ZtaRemediationPackageSummary[];
  onRemediationPackageClick?: (packageId: string) => Promise<void>;
}) {
  if (packages.length === 0) {
    return formatValue(null);
  }

  return (
    <div className="flex max-w-96 flex-wrap gap-1">
      {packages.map((remediationPackage) => {
        const createdAt = formatDate(remediationPackage.createdAt);
        const title = `Package ${remediationPackage.id}\nCreated: ${createdAt}\nTasks: ${remediationPackage.taskCount}`;

        if (!onRemediationPackageClick) {
          return (
            <Badge key={remediationPackage.id} title={title} variant="outline">
              {createdAt}
            </Badge>
          );
        }

        return (
          <button
            key={remediationPackage.id}
            aria-label={`Open remediation package ${remediationPackage.id}`}
            className="inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={title}
            type="button"
            onClick={() => {
              void onRemediationPackageClick(remediationPackage.id);
            }}
          >
            {createdAt}
          </button>
        );
      })}
    </div>
  );
}

export function getRemediationPackageSearchValues(test: ZtaReportTest): string[] {
  return (test.RemediationPackages ?? []).flatMap((remediationPackage) => [
    remediationPackage.id,
    remediationPackage.createdAt,
    formatDate(remediationPackage.createdAt),
    String(remediationPackage.taskCount)
  ]);
}
