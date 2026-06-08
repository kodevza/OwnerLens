import type { EntraPrincipalPermissionSummary } from "../../core/azure/entra/servicePrincipal";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { Badge } from "../../report/components/ui/badge";

export const servicePrincipalFieldRenderers: ReportColumnRenderers<EntraPrincipalPermissionSummary> = {
  oauthPemrissionsCount: (sp) => (
    <PermissionCountBadge
      appRolePermissionsCount={sp.appRolesPermissionCount}
      isAllParticipant={sp.isAllParticipant}
      oauthPermissionsCount={sp.oauthPemrissionsCount}
    />
  )
};

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
