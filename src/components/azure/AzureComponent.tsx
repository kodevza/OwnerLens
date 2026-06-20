import { useState } from "react";

import type { ZtaRelatedObject } from "../../core/azure/ztaReport";
import { appConfig } from "../../core/config";
import type { RemediationPackage } from "../../core/runtime/remediation";
import type { ColumnFilters, SortRule } from "../../core/collectionControls";
import { ClosableTab } from "../../report/components/ClosableTab";
import { Tabs, TabsList, TabsTrigger } from "../../report/components/ui/tabs";
import { AzureRbacComponent } from "./resource/AzureRbacComponent";
import { EntraPermissionsComponent } from "./identity/EntraPermissionsComponent";
import { ManagedIdentityComponent } from "./identity/ManagedIdentityComponent";
import { OwnershipEvidenceComponent } from "./identity/OwnershipEvidenceComponent";
import { RemediationPackageComponent } from "./RemediationPackageComponent";
import { ResourceGroupComponent, type AzureRbacResourceGroupSelection } from "./resource/ResourceGroupComponent";
import { ServicePrincipalComponent } from "./identity/ServicePrincipalComponent";
import type {
  AzureRbacPrincipalSelection,
  EntraPermissionsPrincipalSelection,
  OwnershipEvidenceSelection
} from "./identity/ServicePrincipalFieldRenderers";
import { useAzureViewNavigation } from "./useAzureViewNavigation";
import { ZtaComponent } from "./remediation/ZtaComponent";

type AzureView =
  | "servicePrincipals"
  | "managedIdentities"
  | "resourceGroups"
  | "zeroTrustAssessment"
  | "azureRbac"
  | "entraPermissions"
  | "ownershipEvidence"
  | "remediationPackage";

const viewValues: AzureView[] = [
  "servicePrincipals",
  "managedIdentities",
  "resourceGroups",
  "zeroTrustAssessment",
  "azureRbac",
  "entraPermissions",
  "ownershipEvidence",
  "remediationPackage"
];

const zeroTrustAssessmentEnabled = appConfig.features.zeroTrustAssessment;
const enabledViewValues = zeroTrustAssessmentEnabled
  ? viewValues
  : viewValues.filter((view) => view !== "zeroTrustAssessment");

type PersistentTableView = Extract<AzureView, "servicePrincipals" | "managedIdentities" | "resourceGroups">;

type PersistentTableControls = {
  filters: ColumnFilters;
  page: number;
  sortRules: SortRule[];
};

type AzureRbacTab = AzureRbacPrincipalSelection & {
  kind: "servicePrincipal";
  returnView: Extract<AzureView, "servicePrincipals" | "managedIdentities" | "remediationPackage">;
} | AzureRbacResourceGroupSelection & {
  kind: "resourceGroup";
  returnView: Extract<AzureView, "resourceGroups">;
};

type EntraPermissionsTab = EntraPermissionsPrincipalSelection & {
  returnView: Extract<AzureView, "servicePrincipals" | "managedIdentities" | "remediationPackage">;
};

type OwnershipEvidenceTab = OwnershipEvidenceSelection & {
  returnView: Extract<AzureView, "resourceGroups" | "servicePrincipals" | "managedIdentities" | "remediationPackage">;
};

type RemediationPackageTab = {
  remediationPackage: RemediationPackage;
  returnView: Extract<AzureView, "servicePrincipals" | "managedIdentities" | "zeroTrustAssessment">;
};

export function AzureComponent() {
  const { activeView, activateView } = useAzureViewNavigation<AzureView>(
    "servicePrincipals",
    enabledViewValues
  );
  const [azureRbacTab, setAzureRbacTab] = useState<AzureRbacTab | null>(null);
  const [entraPermissionsTab, setEntraPermissionsTab] = useState<EntraPermissionsTab | null>(null);
  const [ownershipEvidenceTab, setOwnershipEvidenceTab] = useState<OwnershipEvidenceTab | null>(null);
  const [remediationPackageTab, setRemediationPackageTab] = useState<RemediationPackageTab | null>(null);
  const [ztaRelatedObjectFilter, setZtaRelatedObjectFilter] = useState<string | null>(null);
  const [tableControls, setTableControls] = useState<Record<PersistentTableView, PersistentTableControls>>({
    servicePrincipals: createPersistentTableControls(),
    managedIdentities: createPersistentTableControls(),
    resourceGroups: createPersistentTableControls()
  });

  function openRelatedPrincipal(relatedObject: ZtaRelatedObject) {
    const view = getRelatedPrincipalView(relatedObject);
    if (!view) {
      return;
    }

    const objectId = getRelatedPrincipalObjectId(relatedObject);
    if (!objectId) {
      return;
    }

    setPersistentTableControls(view, {
      filters: getPrincipalObjectFilters(objectId),
      page: 1
    });
    activateView(view);
  }

  function setPersistentTableControls(view: PersistentTableView, controls: Partial<PersistentTableControls>) {
    setTableControls((currentControls) => ({
      ...currentControls,
      [view]: {
        ...currentControls[view],
        ...controls
      }
    }));
  }

  function openZtaRelatedObject(objectId: string) {
    if (!zeroTrustAssessmentEnabled) {
      return;
    }

    setZtaRelatedObjectFilter(objectId);
    activateView("zeroTrustAssessment");
  }

  function openAzureRbac(
    principal: AzureRbacPrincipalSelection,
    returnView: Extract<AzureRbacTab["returnView"], "servicePrincipals" | "managedIdentities" | "remediationPackage">
  ) {
    setAzureRbacTab({ ...principal, kind: "servicePrincipal", returnView });
    activateView("azureRbac");
  }

  function openResourceGroupAzureRbac(selection: AzureRbacResourceGroupSelection) {
    setAzureRbacTab({ ...selection, kind: "resourceGroup", returnView: "resourceGroups" });
    activateView("azureRbac");
  }

  function openEntraPermissions(
    principal: EntraPermissionsPrincipalSelection,
    returnView: EntraPermissionsTab["returnView"]
  ) {
    setEntraPermissionsTab({ ...principal, returnView });
    activateView("entraPermissions");
  }

  function openOwnershipEvidence(
    selection: OwnershipEvidenceSelection,
    returnView: OwnershipEvidenceTab["returnView"]
  ) {
    setOwnershipEvidenceTab({ ...selection, returnView });
    activateView("ownershipEvidence");
  }

  function openRemediationPackage(
    remediationPackage: RemediationPackage,
    returnView: RemediationPackageTab["returnView"]
  ) {
    setRemediationPackageTab({ remediationPackage, returnView });
    activateView("remediationPackage");
  }

  function closeAzureRbac() {
    const nextView = azureRbacTab?.returnView ?? "servicePrincipals";
    setAzureRbacTab(null);
    if (activeView === "azureRbac") {
      activateView(nextView);
    }
  }

  function closeEntraPermissions() {
    const nextView = entraPermissionsTab?.returnView ?? "servicePrincipals";
    setEntraPermissionsTab(null);
    if (activeView === "entraPermissions") {
      activateView(nextView);
    }
  }

  function closeOwnershipEvidence() {
    const nextView = ownershipEvidenceTab?.returnView ?? "servicePrincipals";
    setOwnershipEvidenceTab(null);
    if (activeView === "ownershipEvidence") {
      activateView(nextView);
    }
  }

  function closeRemediationPackage() {
    const nextView = remediationPackageTab?.returnView ?? (zeroTrustAssessmentEnabled ? "zeroTrustAssessment" : "servicePrincipals");
    setRemediationPackageTab(null);
    if (activeView === "remediationPackage") {
      activateView(nextView);
    }
  }

  const ownershipEvidenceDisplayName = ownershipEvidenceTab ? getOwnershipEvidenceTabDisplayName(ownershipEvidenceTab) : null;

  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs className="relative z-10 -mb-px gap-0" value={activeView} onValueChange={(value) => activateView(value as AzureView)}>
          <TabsList aria-label="Azure data" className="w-fit max-w-full items-end gap-1 rounded-none bg-transparent p-0 shadow-none">
            <TabsTrigger className={azureTabTriggerClassName} value="resourceGroups">
              Resource groups
            </TabsTrigger>
            <TabsTrigger className={azureTabTriggerClassName} value="servicePrincipals">
              Service principals
            </TabsTrigger>
            <TabsTrigger className={azureTabTriggerClassName} value="managedIdentities">
              Managed identities
            </TabsTrigger>
            {zeroTrustAssessmentEnabled ? (
              <TabsTrigger className={azureTabTriggerClassName} value="zeroTrustAssessment">
                Zero Trust Assessment
              </TabsTrigger>
            ) : null}
            {azureRbacTab ? (
              <ClosableTab
                active={activeView === "azureRbac"}
                closeLabel={`Close ${azureRbacTab.displayName} Azure RBAC tab`}
                label={azureRbacTab.displayName}
                onClose={closeAzureRbac}
                value="azureRbac"
              />
            ) : null}
            {entraPermissionsTab ? (
              <ClosableTab
                active={activeView === "entraPermissions"}
                closeLabel={`Close ${entraPermissionsTab.displayName} Entra API permissions tab`}
                label={`${entraPermissionsTab.displayName} permissions`}
                onClose={closeEntraPermissions}
                value="entraPermissions"
              />
            ) : null}
            {ownershipEvidenceTab ? (
              <ClosableTab
                active={activeView === "ownershipEvidence"}
                closeLabel={`Close ${ownershipEvidenceDisplayName} ownership evidence tab`}
                label={`${ownershipEvidenceDisplayName} owners`}
                onClose={closeOwnershipEvidence}
                value="ownershipEvidence"
              />
            ) : null}
            {remediationPackageTab ? (
              <ClosableTab
                active={activeView === "remediationPackage"}
                closeLabel="Close remediation package tab"
                label="Remediation package"
                onClose={closeRemediationPackage}
                value="remediationPackage"
              />
            ) : null}
          </TabsList>
        </Tabs>
      </div>
      <div className="relative z-0">
        {activeView === "resourceGroups" ? (
          <ResourceGroupComponent
            initialFilters={tableControls.resourceGroups.filters}
            initialPage={tableControls.resourceGroups.page}
            initialSortRules={tableControls.resourceGroups.sortRules}
            onAzureRbacClick={openResourceGroupAzureRbac}
            onFiltersChange={(filters) => setPersistentTableControls("resourceGroups", { filters })}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, "resourceGroups")}
            onPageChange={(page) => setPersistentTableControls("resourceGroups", { page })}
            onSortRulesChange={(sortRules) => setPersistentTableControls("resourceGroups", { sortRules })}
          />
        ) : null}
        {activeView === "servicePrincipals" ? (
          <ServicePrincipalComponent
            initialFilters={tableControls.servicePrincipals.filters}
            initialPage={tableControls.servicePrincipals.page}
            initialSortRules={tableControls.servicePrincipals.sortRules}
            onAzureRbacClick={(principal) => openAzureRbac(principal, "servicePrincipals")}
            onEntraPermissionsClick={(principal) => openEntraPermissions(principal, "servicePrincipals")}
            onFiltersChange={(filters) => setPersistentTableControls("servicePrincipals", { filters })}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, "servicePrincipals")}
            onPageChange={(page) => setPersistentTableControls("servicePrincipals", { page })}
            onRemediationPackageClick={(remediationPackage) => openRemediationPackage(remediationPackage, "servicePrincipals")}
            onSortRulesChange={(sortRules) => setPersistentTableControls("servicePrincipals", { sortRules })}
            onZtaRemediationsClick={openZtaRelatedObject}
          />
        ) : null}
        {activeView === "managedIdentities" ? (
          <ManagedIdentityComponent
            initialFilters={tableControls.managedIdentities.filters}
            initialPage={tableControls.managedIdentities.page}
            initialSortRules={tableControls.managedIdentities.sortRules}
            onAzureRbacClick={(principal) => openAzureRbac(principal, "managedIdentities")}
            onEntraPermissionsClick={(principal) => openEntraPermissions(principal, "managedIdentities")}
            onFiltersChange={(filters) => setPersistentTableControls("managedIdentities", { filters })}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, "managedIdentities")}
            onPageChange={(page) => setPersistentTableControls("managedIdentities", { page })}
            onRemediationPackageClick={(remediationPackage) => openRemediationPackage(remediationPackage, "managedIdentities")}
            onSortRulesChange={(sortRules) => setPersistentTableControls("managedIdentities", { sortRules })}
            onZtaRemediationsClick={openZtaRelatedObject}
          />
        ) : null}
        {activeView === "azureRbac" && azureRbacTab ? (
          <AzureRbacComponent key={getAzureRbacTabKey(azureRbacTab)} target={getAzureRbacTabTarget(azureRbacTab)} />
        ) : null}
        {activeView === "entraPermissions" && entraPermissionsTab ? (
          <EntraPermissionsComponent key={entraPermissionsTab.objectId} principalId={entraPermissionsTab.objectId} />
        ) : null}
        {activeView === "ownershipEvidence" && ownershipEvidenceTab ? (
          <OwnershipEvidenceComponent
            key={getOwnershipEvidenceTabKey(ownershipEvidenceTab)}
            displayName={ownershipEvidenceDisplayName ?? ownershipEvidenceTab.displayName}
            target={ownershipEvidenceTab.target}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, ownershipEvidenceTab.returnView)}
          />
        ) : null}
        {zeroTrustAssessmentEnabled && activeView === "zeroTrustAssessment" ? (
          <ZtaComponent
            initialFilters={getZtaRelatedObjectFilters(ztaRelatedObjectFilter)}
            onRelatedObjectClick={openRelatedPrincipal}
            onRemediationPackageClick={(remediationPackage) => openRemediationPackage(remediationPackage, "zeroTrustAssessment")}
            onRemediationPackageCreated={(remediationPackage) => openRemediationPackage(remediationPackage, "zeroTrustAssessment")}
          />
        ) : null}
        {activeView === "remediationPackage" && remediationPackageTab ? (
          <RemediationPackageComponent
            key={remediationPackageTab.remediationPackage.id}
            remediationPackage={remediationPackageTab.remediationPackage}
            onAzureRbacClick={(principal) => openAzureRbac(principal, "remediationPackage")}
            onEntraPermissionsClick={(principal) => openEntraPermissions(principal, "remediationPackage")}
          />
        ) : null}
      </div>
    </section>
  );
}

const azureTabTriggerClassName =
  "rounded-b-none border border-transparent border-b-border bg-muted/70 shadow-none hover:bg-muted data-[state=active]:border-border data-[state=active]:border-b-card data-[state=active]:bg-card data-[state=active]:shadow-none";

function getZtaRelatedObjectFilters(objectId: string | null): ColumnFilters | undefined {
  if (!objectId) {
    return undefined;
  }

  return {
    RelatedObjects: {
      type: "objectFields",
      conditions: [{ fieldId: "servicePrincipalId", value: objectId }]
    }
  };
}

function createPersistentTableControls(): PersistentTableControls {
  return {
    filters: {},
    page: 1,
    sortRules: []
  };
}

function getPrincipalObjectFilters(objectId: string): ColumnFilters {
  return {
    id: {
      type: "text",
      value: objectId
    }
  };
}

function getRelatedPrincipalObjectId(relatedObject: ZtaRelatedObject): string {
  for (const value of [relatedObject.servicePrincipalId, relatedObject.id, relatedObject.object_id]) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "";
}

function getOwnershipEvidenceTabKey(tab: OwnershipEvidenceTab): string {
  if (tab.target.kind === "resourceGroup") {
    return `${tab.target.subscriptionId}:${tab.target.resourceGroup}`;
  }

  return `${tab.target.kind}:${tab.target.principalId}`;
}

function getOwnershipEvidenceTabDisplayName(tab: OwnershipEvidenceTab): string {
  const prefixByKind: Record<OwnershipEvidenceTab["target"]["kind"], string> = {
    managedIdentity: "MI",
    resourceGroup: "RG",
    servicePrincipal: "SP"
  };
  const prefix = prefixByKind[tab.target.kind];

  if (tab.displayName.startsWith(`${prefix}: `)) {
    return tab.displayName;
  }

  return `${prefix}: ${tab.displayName}`;
}

function getAzureRbacTabKey(tab: AzureRbacTab): string {
  return tab.kind === "servicePrincipal"
    ? tab.objectId
    : `${tab.subscriptionId}:${tab.resourceGroup}`;
}

function getAzureRbacTabTarget(tab: AzureRbacTab) {
  return tab.kind === "servicePrincipal"
    ? { kind: "servicePrincipal" as const, servicePrincipalId: tab.objectId }
    : {
        kind: "resourceGroup" as const,
        subscriptionId: tab.subscriptionId,
        resourceGroup: tab.resourceGroup
      };
}

function getRelatedPrincipalView(
  relatedObject: ZtaRelatedObject
): Extract<PersistentTableView, "servicePrincipals" | "managedIdentities"> | null {
  switch (relatedObject.servicePrincipalType) {
    case "ManagedIdentity":
      return "managedIdentities";
    case "Application":
    case "SocialIdp":
    case "Legacy":
      return "servicePrincipals";
    default:
      return null;
  }
}
