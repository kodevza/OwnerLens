import type { EntraPrincipalPermissionSummary } from "../../core/azure/entra/servicePrincipal";
import type { ZtaRemediationSummary } from "../../core/azure/ztaReport";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { Badge } from "../../report/components/ui/badge";
import { ZtaRemediationBadge } from "./ZtaRemediationBadge";

type EntraPrincipalZtaRow = EntraPrincipalPermissionSummary & ZtaRemediationSummary & {
  id: string;
};

export function buildServicePrincipalFieldRenderers<TRow extends EntraPrincipalZtaRow>({
  onZtaRemediationsClick
}: {
  onZtaRemediationsClick?: (objectId: string) => void;
} = {}): ReportColumnRenderers<TRow> {
  return {
    oauthPemrissionsCount: (sp) => (
      <PermissionCountBadge
        appRolePermissionsCount={sp.appRolesPermissionCount}
        isAllParticipant={sp.isAllParticipant}
        oauthPermissionsCount={sp.oauthPemrissionsCount}
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

function PermissionCountBadge({
  appRolePermissionsCount,
  isAllParticipant,
  oauthPermissionsCount
}: {
  appRolePermissionsCount: number;
  isAllParticipant: boolean;
  oauthPermissionsCount: number;
}) {
  const variant = oauthPermissionsCount === 0 && appRolePermissionsCount === 0 ? "none" : isAllParticipant ? "riskHigh" : "riskMedium";

  return (
    <Badge className="min-w-8 justify-center tabular-nums" variant={variant}>
      {oauthPermissionsCount}/{appRolePermissionsCount}
    </Badge>
  );
}
