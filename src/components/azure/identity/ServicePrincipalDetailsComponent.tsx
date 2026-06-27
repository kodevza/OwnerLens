import { useCallback, useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import type { ManagedIdentity } from "../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../core/azure/entra/servicePrincipal";
import type { PermissionRiskLevel } from "../../../core/risk/types";
import type { OwnerConfidence } from "../../../core/ownership/types";
import { ConfidenceBadge } from "../../../report/components/ConfidenceBadge";
import { PermissionRiskBadge } from "../../../report/components/PermissionRiskBadge";
import { Badge } from "../../../report/components/ui/badge";
import { Button } from "../../../report/components/ui/button";
import { TagBadges } from "../TagBadges";
import { ZtaRemediationPackageBadges } from "../remediation/ZtaRemediationPackageBadges";
import { EntraLinkBadge, buildEntraEnterpriseApplicationPortalUrl } from "./EntraLinkBadge";
import type {
  AzureRbacPrincipalSelection,
  EntraPermissionsPrincipalSelection,
  OwnershipEvidenceSelection
} from "./ServicePrincipalFieldRenderers";
import { formatAzureRbacSummary, OwnerBadge } from "./ServicePrincipalFieldRenderers";

export type EntraPrincipalDetails = ServicePrincipal | ManagedIdentity;

type DetailRow = {
  action?: DetailRowAction;
  copyable?: boolean;
  label: string;
  value: unknown;
  renderAs?: "actionCount" | "boolean" | "confidence" | "count" | "ownerBadge" | "risk" | "stringBadges" | "tags" | "type" | "ztaPackages";
};

type DetailRowAction = {
  ariaLabel: string;
  onClick: () => void;
  title: string;
};

export function ServicePrincipalDetailsComponent({
  onAzureRbacClick,
  onEntraPermissionsClick,
  onOwnershipEvidenceClick,
  servicePrincipal
}: {
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onEntraPermissionsClick?: (principal: EntraPermissionsPrincipalSelection) => void;
  onOwnershipEvidenceClick?: (selection: OwnershipEvidenceSelection) => void;
  servicePrincipal: EntraPrincipalDetails;
}) {
  const portalHref = buildEntraEnterpriseApplicationPortalUrl({
    appId: servicePrincipal.appId,
    objectId: servicePrincipal.id
  });
  const principalSelection = {
    displayName: servicePrincipal.displayName,
    objectId: servicePrincipal.id
  };
  const permissionsPrincipalSelection = {
    appId: servicePrincipal.appId,
    displayName: servicePrincipal.displayName,
    objectId: servicePrincipal.id
  };
  const { analysisRows, applicationRows } = buildServicePrincipalDetailRowGroups(servicePrincipal, {
    onAzureRbacClick: onAzureRbacClick ? () => onAzureRbacClick(principalSelection) : undefined,
    onEntraPermissionsClick: onEntraPermissionsClick
      ? () => onEntraPermissionsClick(permissionsPrincipalSelection)
      : undefined,
    onOwnershipEvidenceClick: onOwnershipEvidenceClick
      ? () =>
          onOwnershipEvidenceClick({
            displayName: servicePrincipal.displayName,
            target: {
              kind: servicePrincipal.servicePrincipalType === "ManagedIdentity" ? "managedIdentity" : "servicePrincipal",
              principalId: servicePrincipal.id
            }
          })
      : undefined
  });
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const copyValue = useCallback(async (row: DetailRow) => {
    const text = getCopyText(row.value);

    if (!text) {
      return;
    }

    await writeClipboardText(text);
    setCopiedLabel(row.label);
    window.setTimeout(() => setCopiedLabel((currentLabel) => (currentLabel === row.label ? null : currentLabel)), 1600);
  }, []);

  return (
    <section className="flex flex-col gap-4 border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{servicePrincipal.displayName || servicePrincipal.id}</h2>
        <div className="font-mono text-xs text-muted-foreground">
          <EntraLinkBadge href={portalHref} title={`Open in Microsoft Entra admin center: ${servicePrincipal.id}`}>
            {servicePrincipal.id}
          </EntraLinkBadge>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 min-[1600px]:grid-cols-2">
        <DetailGroup copiedLabel={copiedLabel} rows={applicationRows} title="Application data" onCopy={copyValue} />
        <DetailGroup copiedLabel={copiedLabel} rows={analysisRows} title="OwnerLens analysis" onCopy={copyValue} />
      </div>
    </section>
  );
}

function DetailGroup({
  copiedLabel,
  onCopy,
  rows,
  title
}: {
  copiedLabel: string | null;
  onCopy: (row: DetailRow) => void;
  rows: DetailRow[];
  title: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <dl className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        {rows.map((row) => (
          <div className="contents" key={row.label}>
            <dt className="font-medium text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words">
              <DetailValue copied={copiedLabel === row.label} row={row} onCopy={onCopy} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function buildServicePrincipalDetailRowGroups(
  servicePrincipal: EntraPrincipalDetails,
  actions: {
    onAzureRbacClick?: () => void;
    onEntraPermissionsClick?: () => void;
    onOwnershipEvidenceClick?: () => void;
  }
): {
  analysisRows: DetailRow[];
  applicationRows: DetailRow[];
} {
  const azureRbacTitle = formatAzureRbacSummary({
    rbacRoleAssignmentCount: servicePrincipal.rbacRoleAssignmentCount,
    roleAssignments: servicePrincipal.roleAssignments
  });

  return {
    applicationRows: [
      { label: "Display name", value: servicePrincipal.displayName },
      { label: "Object ID", value: servicePrincipal.id, copyable: true },
      { label: "Application/client ID", value: servicePrincipal.appId },
      { label: "Application display name", value: servicePrincipal.appDisplayName },
      { label: "Type", value: servicePrincipal.servicePrincipalType, renderAs: "type" },
      { label: "Account enabled", value: servicePrincipal.accountEnabled, renderAs: "boolean" },
      { label: "Publisher", value: servicePrincipal.publisherName },
      { label: "App owner organization ID", value: servicePrincipal.appOwnerOrganizationId },
      { label: "Homepage", value: servicePrincipal.homepage },
      { label: "Login URL", value: servicePrincipal.loginUrl },
      { label: "Reply URLs", value: servicePrincipal.replyUrls, renderAs: "stringBadges" },
      { label: "Service principal names", value: servicePrincipal.servicePrincipalNames, renderAs: "stringBadges" },
      { label: "Tags", value: servicePrincipal.tags, renderAs: "tags" },
      { label: "Service principal owners", value: servicePrincipal.servicePrincipalOwners },
      { label: "Application owners", value: servicePrincipal.applicationOwners },
      { label: "App roles", value: servicePrincipal.appRoles },
      { label: "Notes", value: servicePrincipal.notes },
      { label: "Metadata", value: servicePrincipal.metadata }
    ],
    analysisRows: [
      {
        label: "Owner candidates",
        value: servicePrincipal,
        renderAs: "ownerBadge",
        action: actions.onOwnershipEvidenceClick
          ? {
              ariaLabel: `Open ownership evidence for ${servicePrincipal.ownerCandidates?.[0]?.displayName ?? servicePrincipal.displayName}`,
              onClick: actions.onOwnershipEvidenceClick,
              title: `Open ownership evidence for ${servicePrincipal.displayName || servicePrincipal.id}`
            }
          : undefined
      },
      { label: "Permission risk", value: servicePrincipal.permissionRisk, renderAs: "risk" },
      { label: "OAuth permissions", value: servicePrincipal.oauthPermissionsCount, renderAs: "count" },
      {
        label: "Application permissions",
        value: servicePrincipal.appRolesPermissionCount,
        renderAs: "actionCount",
        action: actions.onEntraPermissionsClick
          ? {
              ariaLabel: `Open Entra API permissions ${servicePrincipal.appRolesPermissionCount}`,
              onClick: actions.onEntraPermissionsClick,
              title: `Open Entra API permissions for ${servicePrincipal.displayName || servicePrincipal.id}`
            }
          : undefined
      },
      { label: "Entra permission risk", value: servicePrincipal.entraPermissionRisk, renderAs: "risk" },
      {
        label: "Azure RBAC assignments",
        value: servicePrincipal.rbacRoleAssignmentCount,
        renderAs: "actionCount",
        action: actions.onAzureRbacClick
          ? {
              ariaLabel: `Open Azure RBAC assignments ${servicePrincipal.rbacRoleAssignmentCount}`,
              onClick: actions.onAzureRbacClick,
              title: azureRbacTitle
            }
          : undefined
      },
      { label: "Azure RBAC subscriptions", value: servicePrincipal.rbacSubscriptionCount, renderAs: "count" },
      { label: "Azure RBAC risk", value: servicePrincipal.rbacRoleLevel, renderAs: "risk" },
      {
        label: "Role assignments",
        value: servicePrincipal.roleAssignments.length,
        renderAs: "actionCount",
        action: actions.onAzureRbacClick
          ? {
              ariaLabel: `Open role assignments ${servicePrincipal.roleAssignments.length}`,
              onClick: actions.onAzureRbacClick,
              title: azureRbacTitle
            }
          : undefined
      },
      { label: "Assigned resource group", value: "resourceGroup" in servicePrincipal ? servicePrincipal.resourceGroup : undefined },
      { label: "Assigned resource groups", value: "assignedResourceGroups" in servicePrincipal ? servicePrincipal.assignedResourceGroups : undefined, renderAs: "stringBadges" },
      { label: "Managed identity assignments", value: "managedIdentityAssignments" in servicePrincipal ? servicePrincipal.managedIdentityAssignments : undefined }
    ]
  };
}

function DetailValue({ copied, onCopy, row }: { copied: boolean; onCopy: (row: DetailRow) => void; row: DetailRow }) {
  const renderedValue = renderDetailValue(row);
  const canCopy = row.copyable === true && Boolean(getCopyText(row.value));

  if (!canCopy) {
    return renderedValue;
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <span className="min-w-0 break-words">{renderedValue}</span>
      <Button
        aria-label={`Copy ${row.label}`}
        className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        size="icon"
        title={copied ? "Copied" : `Copy ${row.label}`}
        type="button"
        variant="ghost"
        onClick={() => onCopy(row)}
      >
        {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
      </Button>
    </span>
  );
}

function renderDetailValue(row: DetailRow) {
  const { renderAs, value } = row;

  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">-</span>;
  }

  if (renderAs === "boolean" && typeof value === "boolean") {
    return (
      <Badge variant={value ? "high" : "none"}>
        {value ? "Yes" : "No"}
      </Badge>
    );
  }

  if (renderAs === "confidence" && isOwnerConfidence(value)) {
    return <ConfidenceBadge confidence={value} />;
  }

  if (renderAs === "count" && typeof value === "number") {
    return (
      <Badge className="min-w-8 justify-center tabular-nums" variant={value > 0 ? "outline" : "none"}>
        {value}
      </Badge>
    );
  }

  if (renderAs === "ownerBadge" && isEntraPrincipalDetails(value)) {
    return (
      <OwnerBadge
        confidence={value.ownerConfidence ?? "none"}
        ownerCandidates={value.ownerCandidates ?? []}
        onClick={row.action?.onClick}
      />
    );
  }

  if (renderAs === "actionCount" && typeof value === "number") {
    return <ActionCountBadge action={row.action} value={value} />;
  }

  if (renderAs === "risk" && isPermissionRisk(value)) {
    return <PermissionRiskBadge riskLevel={value} />;
  }

  if (renderAs === "stringBadges" && Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return <StringBadges values={value} />;
  }

  if (renderAs === "tags") {
    return <TagBadges tags={value as Parameters<typeof TagBadges>[0]["tags"]} />;
  }

  if (renderAs === "type" && typeof value === "string") {
    return <Badge variant="secondary">{value}</Badge>;
  }

  if (renderAs === "ztaPackages" && Array.isArray(value)) {
    return <ZtaRemediationPackageBadges packages={value} />;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground">-</span>;
    }

    if (value.every((item) => typeof item === "string")) {
      return <StringList values={value} />;
    }

    return <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/40 p-2 text-xs">{formatJson(value)}</pre>;
  }

  if (typeof value === "object") {
    if (Object.keys(value).length === 0) {
      return <span className="text-muted-foreground">-</span>;
    }

    return <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/40 p-2 text-xs">{formatJson(value)}</pre>;
  }

  if (typeof value === "string") {
    return renderStringValue(value);
  }

  return String(value);
}

function ActionCountBadge({ action, value }: { action?: DetailRowAction; value: number }) {
  const badge = (
    <Badge className="min-w-8 justify-center tabular-nums" variant={value > 0 ? "outline" : "none"}>
      {value}
    </Badge>
  );

  if (!action) {
    return badge;
  }

  return (
    <button
      aria-label={action.ariaLabel}
      className="cursor-pointer rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={action.title}
      type="button"
      onClick={action.onClick}
    >
      {badge}
    </button>
  );
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function StringBadges({ values }: { values: string[] }) {
  const visibleValues = values.map((value) => value.trim()).filter((value) => value.length > 0);

  if (visibleValues.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex max-w-full flex-wrap gap-1">
      {visibleValues.map((value) => (
        <Badge key={value} className="max-w-full font-medium" title={value} variant="outline">
          <span className="truncate">{renderStringValue(value)}</span>
        </Badge>
      ))}
    </div>
  );
}

function StringList({ values }: { values: string[] }) {
  const visibleValues = values.map((value) => value.trim()).filter((value) => value.length > 0);

  if (visibleValues.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <span className="inline-flex max-w-full flex-wrap gap-x-1">
      {visibleValues.map((value, index) => (
        <span key={`${value}-${index}`}>
          {renderStringValue(value)}
          {index < visibleValues.length - 1 ? "," : null}
        </span>
      ))}
    </span>
  );
}

function renderStringValue(value: string): ReactNode {
  const href = getExternalHttpHref(value);

  if (!href) {
    return value;
  }

  return (
    <a
      className="inline-flex max-w-full items-center gap-1 text-blue-700 underline-offset-2 hover:text-blue-900 hover:underline focus-visible:text-blue-900"
      href={href}
      rel="noreferrer"
      target="_blank"
      title={`Open external resource: ${value}`}
    >
      <span className="min-w-0 break-words">{value}</span>
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

function getExternalHttpHref(value: string): string | null {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  try {
    const url = new URL(trimmedValue);

    return url.protocol === "http:" || url.protocol === "https:" ? trimmedValue : null;
  } catch {
    return null;
  }
}

function getCopyText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function isOwnerConfidence(value: unknown): value is OwnerConfidence {
  return value === "high" || value === "medium" || value === "low" || value === "none";
}

function isPermissionRisk(value: unknown): value is PermissionRiskLevel {
  return value === "high" || value === "medium" || value === "low" || value === "none";
}

function isEntraPrincipalDetails(value: unknown): value is EntraPrincipalDetails {
  return typeof value === "object" && value !== null && "id" in value && "servicePrincipalType" in value;
}
