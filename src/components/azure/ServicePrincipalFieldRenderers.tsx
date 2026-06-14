import type {
  EntraPrincipalOwnerSummary,
  EntraPrincipalPermissionSummary,
  EntraPrincipalRbacSummary
} from "../../core/azure/entra/servicePrincipal";
import type { OwnerConfidence } from "../../core/ownership/types";
import type { PermissionRiskLevel } from "../../core/risk/types";
import type { ZtaRemediationSummary } from "../../core/azure/ztaReport";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { Badge, type BadgeProps } from "../../report/components/ui/badge";
import { ZtaRemediationBadge } from "./ZtaRemediationBadge";

type EntraPrincipalSummaryRow = EntraPrincipalPermissionSummary & EntraPrincipalRbacSummary & Partial<EntraPrincipalOwnerSummary> & ZtaRemediationSummary & {
  azureRbac: string;
  displayName: string;
  id: string;
};

type EntraPrincipalIdentitySummary = EntraPrincipalPermissionSummary & EntraPrincipalRbacSummary & Partial<EntraPrincipalOwnerSummary> & {
  azureRbac: string;
  displayName: string;
  id: string;
};

export type AzureRbacPrincipalSelection = {
  displayName: string;
  objectId: string;
};

export type EntraPermissionsPrincipalSelection = AzureRbacPrincipalSelection;

type ServicePrincipalFieldRendererOptions = {
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onEntraPermissionsClick?: (principal: EntraPermissionsPrincipalSelection) => void;
  onZtaRemediationsClick?: (objectId: string) => void;
};

type ServicePrincipalFieldRendererMappedOptions<TRow> = ServicePrincipalFieldRendererOptions & {
  getPrincipalSummary: (row: TRow) => EntraPrincipalIdentitySummary | null;
};

export function buildServicePrincipalFieldRenderers<TRow extends EntraPrincipalSummaryRow>(
  options?: ServicePrincipalFieldRendererOptions
): ReportColumnRenderers<TRow>;
export function buildServicePrincipalFieldRenderers<TRow>(
  options: ServicePrincipalFieldRendererMappedOptions<TRow>
): ReportColumnRenderers<TRow>;
export function buildServicePrincipalFieldRenderers<TRow>({
  getPrincipalSummary,
  onAzureRbacClick,
  onEntraPermissionsClick,
  onZtaRemediationsClick
}: ServicePrincipalFieldRendererOptions & {
  getPrincipalSummary?: (row: TRow) => EntraPrincipalIdentitySummary | null;
} = {}): ReportColumnRenderers<TRow> {
  const readPrincipalSummary =
    getPrincipalSummary ?? ((row: TRow) => row as unknown as EntraPrincipalIdentitySummary);

  return {
    azureRbac: (row) => {
      const sp = readPrincipalSummary(row);

      return sp ? (
        <RbacSummaryBadge
          rbacRoleAssignmentCount={sp.rbacRoleAssignmentCount}
          rbacRoleLevel={sp.rbacRoleLevel}
          rbacSubscriptionCount={sp.rbacSubscriptionCount}
          title={sp.azureRbac}
          onClick={onAzureRbacClick ? () => onAzureRbacClick({ displayName: sp.displayName, objectId: sp.id }) : undefined}
        />
      ) : (
        <EmptyValue />
      );
    },
    oauthPemrissionsCount: (row) => {
      const sp = readPrincipalSummary(row);

      return sp ? (
        <PermissionCountBadge
          appRolePermissionsCount={sp.appRolesPermissionCount}
          entraPermissionRisk={sp.entraPermissionRisk}
          oauthPermissionsCount={sp.oauthPemrissionsCount}
          onClick={
            onEntraPermissionsClick ? () => onEntraPermissionsClick({ displayName: sp.displayName, objectId: sp.id }) : undefined
          }
        />
      ) : (
        <EmptyValue />
      );
    },
    potentialOwners: (row) => {
      const sp = readPrincipalSummary(row);

      return sp ? (
        <OwnerBadge
          confidence={sp.ownerConfidence ?? "none"}
          owners={sp.potentialOwners ?? []}
        />
      ) : (
        <EmptyValue />
      );
    },
    ztaRemediationCountAll: (row) => {
      const sp = isZtaRemediationSummary(row) ? row : null;
      const principal = readPrincipalSummary(row);

      return sp && principal ? (
        <ZtaRemediationBadge
          ztaMaxRisk={sp.ztaMaxRisk}
          ztaRemediationCountAll={sp.ztaRemediationCountAll}
          ztaRemediationFailedCount={sp.ztaRemediationFailedCount}
          onClick={onZtaRemediationsClick ? () => onZtaRemediationsClick(principal.id) : undefined}
        />
      ) : (
        <EmptyValue />
      );
    }
  };
}

export const servicePrincipalFieldRenderers = buildServicePrincipalFieldRenderers();

const permissionRiskBadgeVariants: Record<PermissionRiskLevel, BadgeProps["variant"]> = {
  high: "riskHigh",
  medium: "riskMedium",
  low: "riskLow",
  none: "riskNone"
};

function RbacSummaryBadge({
  onClick,
  rbacRoleAssignmentCount,
  rbacRoleLevel,
  rbacSubscriptionCount,
  title
}: EntraPrincipalRbacSummary & { title: string; onClick?: () => void }) {
  const badge = (
    <Badge
      className="min-w-12 justify-center tabular-nums"
      title={title}
      variant={permissionRiskBadgeVariants[rbacRoleLevel]}
    >
      {rbacRoleAssignmentCount}/{rbacSubscriptionCount}
    </Badge>
  );

  if (!onClick) {
    return badge;
  }

  return (
    <button
      aria-label={`Open Azure RBAC assignments ${rbacRoleAssignmentCount}/${rbacSubscriptionCount}`}
      className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={title}
      type="button"
      onClick={onClick}
    >
      {badge}
    </button>
  );
}

function OwnerBadge({ confidence, owners }: { confidence: OwnerConfidence; owners: string[] }) {
  if (owners.length === 0) {
    return (
      <Badge className="max-w-72 justify-center truncate" title={`No owner (${confidence} confidence)`} variant={confidence}>
        -
      </Badge>
    );
  }

  return (
    <div className="flex max-w-72 flex-wrap gap-1">
      {owners.map((owner) => (
        <Badge key={owner} className="max-w-full justify-center truncate" title={`${owner} (${confidence} confidence)`} variant={confidence}>
          {owner}
        </Badge>
      ))}
    </div>
  );
}

function PermissionCountBadge({
  appRolePermissionsCount,
  entraPermissionRisk,
  onClick,
  oauthPermissionsCount
}: {
  appRolePermissionsCount: number;
  entraPermissionRisk: PermissionRiskLevel;
  onClick?: () => void;
  oauthPermissionsCount: number;
}) {
  const label = `${oauthPermissionsCount}/${appRolePermissionsCount}`;
  const badge = (
    <Badge className="min-w-8 justify-center tabular-nums" variant={permissionRiskBadgeVariants[entraPermissionRisk]}>
      {label}
    </Badge>
  );

  if (!onClick) {
    return badge;
  }

  return (
    <button
      aria-label={`Open Entra API permissions ${label}`}
      className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`Open Entra API permissions ${label}`}
      type="button"
      onClick={onClick}
    >
      {badge}
    </button>
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground">-</span>;
}

function isZtaRemediationSummary(value: unknown): value is ZtaRemediationSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const summary = value as Partial<ZtaRemediationSummary>;

  return (
    typeof summary.ztaRemediationCountAll === "number" &&
    typeof summary.ztaRemediationFailedCount === "number" &&
    isPermissionRiskLevel(summary.ztaMaxRisk)
  );
}

function isPermissionRiskLevel(value: unknown): value is PermissionRiskLevel {
  return value === "high" || value === "medium" || value === "low" || value === "none";
}
