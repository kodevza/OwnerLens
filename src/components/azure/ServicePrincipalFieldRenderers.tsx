import type {
  EntraPrincipalPermissionSummary,
  EntraPrincipalRbacSummary
} from "../../core/azure/entra/servicePrincipal";
import type { PermissionRiskLevel } from "../../core/risk/types";
import type { ZtaRemediationSummary } from "../../core/azure/ztaReport";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { Badge, type BadgeProps } from "../../report/components/ui/badge";
import { ZtaRemediationBadge } from "./ZtaRemediationBadge";

type EntraPrincipalSummaryRow = EntraPrincipalPermissionSummary & EntraPrincipalRbacSummary & ZtaRemediationSummary & {
  azureRbac: string;
  displayName: string;
  id: string;
};

export type AzureRbacPrincipalSelection = {
  displayName: string;
  objectId: string;
};

export type EntraPermissionsPrincipalSelection = AzureRbacPrincipalSelection;

export function buildServicePrincipalFieldRenderers<TRow extends EntraPrincipalSummaryRow>({
  onAzureRbacClick,
  onEntraPermissionsClick,
  onZtaRemediationsClick
}: {
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onEntraPermissionsClick?: (principal: EntraPermissionsPrincipalSelection) => void;
  onZtaRemediationsClick?: (objectId: string) => void;
} = {}): ReportColumnRenderers<TRow> {
  return {
    azureRbac: (sp) => (
      <RbacSummaryBadge
        rbacRoleAssignmentCount={sp.rbacRoleAssignmentCount}
        rbacRoleLevel={sp.rbacRoleLevel}
        rbacSubscriptionCount={sp.rbacSubscriptionCount}
        title={sp.azureRbac}
        onClick={onAzureRbacClick ? () => onAzureRbacClick({ displayName: sp.displayName, objectId: sp.id }) : undefined}
      />
    ),
    oauthPemrissionsCount: (sp) => (
      <PermissionCountBadge
        appRolePermissionsCount={sp.appRolesPermissionCount}
        entraPermissionRisk={sp.entraPermissionRisk}
        oauthPermissionsCount={sp.oauthPemrissionsCount}
        onClick={
          onEntraPermissionsClick ? () => onEntraPermissionsClick({ displayName: sp.displayName, objectId: sp.id }) : undefined
        }
      />
    ),
    ztaRemediationCountAll: (sp) => (
      <ZtaRemediationBadge
        ztaMaxRisk={sp.ztaMaxRisk}
        ztaRemediationCountAll={sp.ztaRemediationCountAll}
        ztaRemediationFailedCount={sp.ztaRemediationFailedCount}
        onClick={onZtaRemediationsClick ? () => onZtaRemediationsClick(sp.id) : undefined}
      />
    )
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
      aria-label={`Open Entra permissions ${label}`}
      className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`Open Entra permissions ${label}`}
      type="button"
      onClick={onClick}
    >
      {badge}
    </button>
  );
}
