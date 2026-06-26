import { FingerprintPattern, KeyRound, UsersRound } from "lucide-react";
import type { MouseEvent } from "react";

import type { OwnershipEvidenceItem } from "../../../core/ownership/types";
import type { ReportColumnRenderers } from "../../../report/buildCollectionColumns";
import { ConfidenceBadge } from "../../../report/components/ConfidenceBadge";
import { Badge } from "../../../report/components/ui/badge";
import { AzureLinkBadge, buildAzureResourceGroupPortalUrl } from "../AzureLinkBadge";
import type { EvidenceStatus, OwnershipEvidenceTarget } from "../api";
import {
  formatOwnershipEvidenceDiscoverySource,
  formatOwnershipEvidencePath,
  formatOwnershipEvidenceScope,
  formatOwnershipEvidenceSource,
  getEvidenceStatusLabel
} from "./ownershipEvidenceFormatters";

export function buildOwnershipEvidenceFieldRenderers({
  onApplicationEvidenceClick,
  onApplicationRbacClick,
  onUserGroupsClick,
  onStatusChange,
  updatingEvidenceKeys
}: {
  onApplicationEvidenceClick?: (evidence: OwnershipEvidenceItem, target: OwnershipEvidenceTarget) => void;
  onApplicationRbacClick?: (evidence: OwnershipEvidenceItem, target: OwnershipEvidenceTarget) => void;
  onUserGroupsClick: (evidence: OwnershipEvidenceItem, event: MouseEvent<HTMLButtonElement>) => void;
  onStatusChange: (evidence: OwnershipEvidenceItem, status: EvidenceStatus) => void;
  updatingEvidenceKeys: ReadonlySet<string>;
}): ReportColumnRenderers<OwnershipEvidenceItem> {
  return {
    ownerDisplayName: (evidence) => (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate font-medium" title={evidence.ownerDisplayName || undefined}>
            {evidence.ownerDisplayName || "-"}
          </div>
          {evidence.ownerType === "ownerUser" && evidence.ownerDisplayName ? (
            <button
              aria-label={`Open direct groups for ${evidence.ownerDisplayName}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-input text-muted-foreground hover:bg-muted hover:text-foreground"
              title={`Open direct groups for ${evidence.ownerDisplayName}`}
              type="button"
              onClick={(event) => onUserGroupsClick(evidence, event)}
            >
              <UsersRound aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {getApplicationEvidenceTarget(evidence) && onApplicationEvidenceClick ? (
            <button
              aria-label={`Open application ownership evidence for ${evidence.ownerDisplayName}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-input text-muted-foreground hover:bg-muted hover:text-foreground"
              title={`Open ownership evidence for ${evidence.ownerDisplayName}`}
              type="button"
              onClick={(event) => {
                const applicationTarget = getApplicationEvidenceTarget(evidence);
                event.stopPropagation();
                if (applicationTarget) {
                  onApplicationEvidenceClick(evidence, applicationTarget);
                }
              }}
            >
              <FingerprintPattern aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {getApplicationEvidenceTarget(evidence) && onApplicationRbacClick ? (
            <button
              aria-label={`Open application Azure RBAC assignments for ${evidence.ownerDisplayName}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-input text-muted-foreground hover:bg-muted hover:text-foreground"
              title={`Open Azure RBAC assignments for ${evidence.ownerDisplayName}`}
              type="button"
              onClick={(event) => {
                const applicationTarget = getApplicationEvidenceTarget(evidence);
                event.stopPropagation();
                if (applicationTarget) {
                  onApplicationRbacClick(evidence, applicationTarget);
                }
              }}
            >
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{evidence.ownerType}</div>
      </div>
    ),
    confidence: (evidence) => <ConfidenceBadge confidence={evidence.confidence} />,
    source: (evidence) => <span>{formatOwnershipEvidenceSource(evidence.source)}</span>,
    path: (evidence) => <span>{formatOwnershipEvidencePath(evidence.path)}</span>,
    discoverySource: (evidence) => <span>{formatOwnershipEvidenceDiscoverySource(evidence.discoverySource)}</span>,
    relatedScopes: (evidence) => (
      <div className="max-w-md space-y-1">
        {evidence.relatedScopes.length === 0
          ? <span className="text-muted-foreground">-</span>
          : evidence.relatedScopes.map((scope) => {
              const scopeLabel = formatOwnershipEvidenceScope(scope);
              const scopeKey = scopeLabel;

              return (
                <div key={scopeKey} className="truncate" title={scopeLabel}>
                  {scope.subscriptionId && scope.resourceGroup ? (
                    <AzureLinkBadge
                      aria-label={`Open resource group ${scope.resourceGroup} in Azure portal`}
                      href={buildAzureResourceGroupPortalUrl({
                        resourceGroup: scope.resourceGroup,
                        subscriptionId: scope.subscriptionId
                      })}
                      title={`Go to: /subscriptions/${scope.subscriptionId}/resourceGroups/${scope.resourceGroup}`}
                    >
                      {scopeLabel}
                    </AzureLinkBadge>
                  ) : (
                    scopeLabel
                  )}
                </div>
              );
            })}
      </div>
    ),
    status: (evidence) => {
      const statusKey = evidence.statusKey;
      const isUpdating = statusKey ? updatingEvidenceKeys.has(statusKey) : false;
      const nextStatus: EvidenceStatus = evidence.disabled ? "active" : "inactive";
      const nextStatusLabel = evidence.disabled ? "Active" : "Inactive";
      const isEditable = statusKey !== null;

      return (
        <Badge
          aria-disabled={isUpdating}
          aria-label={isEditable ? `Set ${evidence.ownerDisplayName} ownership evidence ${nextStatusLabel}` : undefined}
          className="min-w-20 justify-center"
          role={isEditable ? "button" : undefined}
          tabIndex={isEditable && !isUpdating ? 0 : undefined}
          title={isEditable ? `Set ${nextStatusLabel}` : undefined}
          variant={evidence.disabled ? "riskMedium" : "riskLow"}
          onClick={() => {
            if (isEditable && !isUpdating) {
              onStatusChange(evidence, nextStatus);
            }
          }}
          onKeyDown={(event) => {
            if (isEditable && !isUpdating && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onStatusChange(evidence, nextStatus);
            }
          }}
        >
          {isUpdating ? "Updating" : getEvidenceStatusLabel(evidence)}
        </Badge>
      );
    }
  };
}

function getApplicationEvidenceTarget(evidence: OwnershipEvidenceItem): OwnershipEvidenceTarget | null {
  if (evidence.ownerType !== "application") {
    return null;
  }

  const prefix = "application:";
  if (!evidence.ownerCandidateKey.startsWith(prefix)) {
    return null;
  }

  const principalId = evidence.ownerCandidateKey.slice(prefix.length).trim();
  if (!principalId) {
    return null;
  }

  return {
    kind: "servicePrincipal",
    principalId
  };
}
