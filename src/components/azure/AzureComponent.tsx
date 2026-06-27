import { useState } from "react";

import type { ZtaRelatedObject } from "../../core/azure/ztaReport";
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
import { ServicePrincipalDetailsComponent, type EntraPrincipalDetails } from "./identity/ServicePrincipalDetailsComponent";
import type {
  AzureRbacPrincipalSelection,
  EntraPermissionsPrincipalSelection,
  OwnershipEvidenceSelection
} from "./identity/ServicePrincipalFieldRenderers";
import { useAppConfig } from "./AppConfigContext";
import { useAzureViewNavigation } from "./useAzureViewNavigation";
import { ZtaComponent } from "./remediation/ZtaComponent";

type BaseAzureView =
  | "servicePrincipals"
  | "managedIdentities"
  | "resourceGroups"
  | "zeroTrustAssessment";

type AzureView = BaseAzureView | string;

const viewValues: BaseAzureView[] = [
  "servicePrincipals",
  "managedIdentities",
  "resourceGroups",
  "zeroTrustAssessment"
];

type PersistentTableView = "servicePrincipals" | "managedIdentities" | "resourceGroups";

type PersistentTableControls = {
  filters: ColumnFilters;
  page: number;
  sortRules: SortRule[];
};

type AzureRbacTab = AzureRbacPrincipalSelection & {
  kind: "servicePrincipal";
  returnView: AzureView;
  tabId: string;
} | AzureRbacResourceGroupSelection & {
  kind: "resourceGroup";
  returnView: "resourceGroups";
  tabId: string;
};

type EntraPermissionsTab = EntraPermissionsPrincipalSelection & {
  returnView: AzureView;
  tabId: string;
};

type OwnershipEvidenceTab = OwnershipEvidenceSelection & {
  returnView: AzureView;
  tabId: string;
};

type RemediationPackageTab = {
  remediationPackage: RemediationPackage;
  returnView: AzureView;
  tabId: string;
};

type PrincipalDetailsTab = {
  returnView: AzureView;
  principal: EntraPrincipalDetails;
  tabId: string;
};

export function AzureComponent() {
  const config = useAppConfig();
  const zeroTrustAssessmentEnabled = config.features.zeroTrustAssessment;
  const baseEnabledViewValues = zeroTrustAssessmentEnabled
    ? viewValues
    : viewValues.filter((view) => view !== "zeroTrustAssessment");
  const [azureRbacTabs, setAzureRbacTabs] = useState<AzureRbacTab[]>([]);
  const [entraPermissionsTabs, setEntraPermissionsTabs] = useState<EntraPermissionsTab[]>([]);
  const [ownershipEvidenceTabs, setOwnershipEvidenceTabs] = useState<OwnershipEvidenceTab[]>([]);
  const [remediationPackageTabs, setRemediationPackageTabs] = useState<RemediationPackageTab[]>([]);
  const [principalDetailsTabs, setPrincipalDetailsTabs] = useState<PrincipalDetailsTab[]>([]);
  const enabledViewValues = [
    ...baseEnabledViewValues,
    ...principalDetailsTabs.map((tab) => tab.tabId),
    ...azureRbacTabs.map((tab) => tab.tabId),
    ...entraPermissionsTabs.map((tab) => tab.tabId),
    ...ownershipEvidenceTabs.map((tab) => tab.tabId),
    ...remediationPackageTabs.map((tab) => tab.tabId)
  ];
  const { activeView, activateView } = useAzureViewNavigation<AzureView>(
    "servicePrincipals",
    enabledViewValues
  );
  const [ztaRelatedObjectFilter, setZtaRelatedObjectFilter] = useState<string | null>(null);
  const [tableControls, setTableControls] = useState<Record<PersistentTableView, PersistentTableControls>>({
    servicePrincipals: createPersistentTableControls(),
    managedIdentities: createPersistentTableControls(),
    resourceGroups: createPersistentTableControls()
  });
  const [detailTableControls, setDetailTableControls] = useState<Record<string, PersistentTableControls>>({});
  const azureRbacTab = azureRbacTabs.find((tab) => tab.tabId === activeView) ?? null;
  const entraPermissionsTab = entraPermissionsTabs.find((tab) => tab.tabId === activeView) ?? null;
  const ownershipEvidenceTab = ownershipEvidenceTabs.find((tab) => tab.tabId === activeView) ?? null;
  const remediationPackageTab = remediationPackageTabs.find((tab) => tab.tabId === activeView) ?? null;
  const principalDetailsTab = principalDetailsTabs.find((tab) => tab.tabId === activeView) ?? null;

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
    returnView: AzureView
  ) {
    const tab = { ...principal, kind: "servicePrincipal" as const, returnView, tabId: getAzureRbacPrincipalTabId(principal.objectId) };
    setAzureRbacTabs((currentTabs) => upsertTab(currentTabs, tab));
    activateView(tab.tabId);
  }

  function openResourceGroupAzureRbac(selection: AzureRbacResourceGroupSelection) {
    const tab = { ...selection, kind: "resourceGroup" as const, returnView: "resourceGroups" as const, tabId: getAzureRbacResourceGroupTabId(selection) };
    setAzureRbacTabs((currentTabs) => upsertTab(currentTabs, tab));
    activateView(tab.tabId);
  }

  function openEntraPermissions(
    principal: EntraPermissionsPrincipalSelection,
    returnView: EntraPermissionsTab["returnView"]
  ) {
    const tab = { ...principal, returnView, tabId: getEntraPermissionsTabId(principal.objectId) };
    setEntraPermissionsTabs((currentTabs) => upsertTab(currentTabs, tab));
    activateView(tab.tabId);
  }

  function openOwnershipEvidence(
    selection: OwnershipEvidenceSelection,
    returnView: OwnershipEvidenceTab["returnView"]
  ) {
    const tab = { ...selection, returnView, tabId: getOwnershipEvidenceDetailTabId(selection) };
    setOwnershipEvidenceTabs((currentTabs) => upsertTab(currentTabs, tab));
    activateView(tab.tabId);
  }

  function openRemediationPackage(
    remediationPackage: RemediationPackage,
    returnView: RemediationPackageTab["returnView"]
  ) {
    const tab = { remediationPackage, returnView, tabId: getRemediationPackageTabId(remediationPackage.id) };
    setRemediationPackageTabs((currentTabs) => upsertTab(currentTabs, tab));
    activateView(tab.tabId);
  }

  function openPrincipalDetails(
    principal: EntraPrincipalDetails,
    returnView: PrincipalDetailsTab["returnView"]
  ) {
    const tab = { principal, returnView, tabId: getPrincipalDetailsTabId(principal.id) };
    setPrincipalDetailsTabs((currentTabs) => upsertTab(currentTabs, tab));
    activateView(tab.tabId);
  }

  function setDetailTableControlState(tabId: string, controls: Partial<PersistentTableControls>) {
    setDetailTableControls((currentControls) => ({
      ...currentControls,
      [tabId]: {
        ...(currentControls[tabId] ?? createPersistentTableControls()),
        ...controls
      }
    }));
  }

  function getDetailTableControls(tabId: string): PersistentTableControls {
    return detailTableControls[tabId] ?? createPersistentTableControls();
  }

  function closeAzureRbac(tab: AzureRbacTab) {
    const nextView = tab.returnView ?? "servicePrincipals";
    setAzureRbacTabs((currentTabs) => currentTabs.filter((currentTab) => currentTab.tabId !== tab.tabId));
    setDetailTableControls((currentControls) => removeRecordKey(currentControls, tab.tabId));
    if (activeView === tab.tabId) {
      activateView(nextView);
    }
  }

  function closeEntraPermissions(tab: EntraPermissionsTab) {
    const nextView = tab.returnView ?? "servicePrincipals";
    setEntraPermissionsTabs((currentTabs) => currentTabs.filter((currentTab) => currentTab.tabId !== tab.tabId));
    setDetailTableControls((currentControls) => removeRecordKey(currentControls, tab.tabId));
    if (activeView === tab.tabId) {
      activateView(nextView);
    }
  }

  function closeOwnershipEvidence(tab: OwnershipEvidenceTab) {
    const nextView = tab.returnView ?? "servicePrincipals";
    setOwnershipEvidenceTabs((currentTabs) => currentTabs.filter((currentTab) => currentTab.tabId !== tab.tabId));
    setDetailTableControls((currentControls) => removeRecordKey(currentControls, tab.tabId));
    if (activeView === tab.tabId) {
      activateView(nextView);
    }
  }

  function closeRemediationPackage(tab: RemediationPackageTab) {
    const nextView = tab.returnView ?? (zeroTrustAssessmentEnabled ? "zeroTrustAssessment" : "servicePrincipals");
    setRemediationPackageTabs((currentTabs) => currentTabs.filter((currentTab) => currentTab.tabId !== tab.tabId));
    setDetailTableControls((currentControls) => removeRecordKey(currentControls, tab.tabId));
    if (activeView === tab.tabId) {
      activateView(nextView);
    }
  }

  function closePrincipalDetails(tab: PrincipalDetailsTab) {
    const nextView = tab.returnView ?? "servicePrincipals";
    setPrincipalDetailsTabs((currentTabs) => currentTabs.filter((currentTab) => currentTab.tabId !== tab.tabId));
    if (activeView === tab.tabId) {
      activateView(nextView);
    }
  }

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
            {azureRbacTabs.map((tab) => (
              <ClosableTab
                key={tab.tabId}
                active={activeView === tab.tabId}
                closeLabel={`Close ${getAzureRbacTabDisplayName(tab)} tab`}
                label={getAzureRbacTabDisplayName(tab)}
                onClose={() => closeAzureRbac(tab)}
                value={tab.tabId}
              />
            ))}
            {principalDetailsTabs.map((tab) => (
              <ClosableTab
                key={tab.tabId}
                active={activeView === tab.tabId}
                closeLabel={`Close ${tab.principal.displayName} details tab`}
                label={`INF: ${tab.principal.displayName}`}
                onClose={() => closePrincipalDetails(tab)}
                value={tab.tabId}
              />
            ))}
            {entraPermissionsTabs.map((tab) => (
              <ClosableTab
                key={tab.tabId}
                active={activeView === tab.tabId}
                closeLabel={`Close ${tab.displayName} Entra API permissions tab`}
                label={`PER: ${tab.displayName}`}
                onClose={() => closeEntraPermissions(tab)}
                value={tab.tabId}
              />
            ))}
            {ownershipEvidenceTabs.map((tab) => (
              <ClosableTab
                key={tab.tabId}
                active={activeView === tab.tabId}
                closeLabel={`Close ${getOwnershipEvidenceTabDisplayName(tab)} ownership evidence tab`}
                label={`${getOwnershipEvidenceTabDisplayName(tab)} owners`}
                onClose={() => closeOwnershipEvidence(tab)}
                value={tab.tabId}
              />
            ))}
            {remediationPackageTabs.map((tab) => (
              <ClosableTab
                key={tab.tabId}
                active={activeView === tab.tabId}
                closeLabel="Close remediation package tab"
                label="Remediation package"
                onClose={() => closeRemediationPackage(tab)}
                value={tab.tabId}
              />
            ))}
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
            onPrincipalDetailsClick={(servicePrincipal) => openPrincipalDetails(servicePrincipal, "servicePrincipals")}
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
            onPrincipalDetailsClick={(identity) => openPrincipalDetails(identity, "managedIdentities")}
            onSortRulesChange={(sortRules) => setPersistentTableControls("managedIdentities", { sortRules })}
            onZtaRemediationsClick={openZtaRelatedObject}
          />
        ) : null}
        {azureRbacTab ? (
          <AzureRbacComponent
            key={azureRbacTab.tabId}
            initialFilters={getDetailTableControls(azureRbacTab.tabId).filters}
            initialPage={getDetailTableControls(azureRbacTab.tabId).page}
            initialSortRules={getDetailTableControls(azureRbacTab.tabId).sortRules}
            target={getAzureRbacTabTarget(azureRbacTab)}
            onFiltersChange={(filters) => setDetailTableControlState(azureRbacTab.tabId, { filters })}
            onPageChange={(page) => setDetailTableControlState(azureRbacTab.tabId, { page })}
            onSortRulesChange={(sortRules) => setDetailTableControlState(azureRbacTab.tabId, { sortRules })}
          />
        ) : null}
        {entraPermissionsTab ? (
          <EntraPermissionsComponent
            key={entraPermissionsTab.tabId}
            appId={entraPermissionsTab.appId}
            filters={getDetailTableControls(entraPermissionsTab.tabId).filters}
            principalId={entraPermissionsTab.objectId}
            sortRules={getDetailTableControls(entraPermissionsTab.tabId).sortRules}
            onFiltersChange={(filters) => setDetailTableControlState(entraPermissionsTab.tabId, { filters })}
            onSortRulesChange={(sortRules) => setDetailTableControlState(entraPermissionsTab.tabId, { sortRules })}
          />
        ) : null}
        {principalDetailsTab ? (
          <ServicePrincipalDetailsComponent
            key={principalDetailsTab.tabId}
            servicePrincipal={principalDetailsTab.principal}
            onAzureRbacClick={(principal) => openAzureRbac(principal, principalDetailsTab.tabId)}
            onEntraPermissionsClick={(principal) => openEntraPermissions(principal, principalDetailsTab.tabId)}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, principalDetailsTab.tabId)}
          />
        ) : null}
        {ownershipEvidenceTab ? (
          <OwnershipEvidenceComponent
            key={ownershipEvidenceTab.tabId}
            displayName={getOwnershipEvidenceTabDisplayName(ownershipEvidenceTab)}
            filters={getDetailTableControls(ownershipEvidenceTab.tabId).filters}
            sortRules={getDetailTableControls(ownershipEvidenceTab.tabId).sortRules}
            target={ownershipEvidenceTab.target}
            onAzureRbacClick={(principal) => openAzureRbac(principal, ownershipEvidenceTab.tabId)}
            onFiltersChange={(filters) => setDetailTableControlState(ownershipEvidenceTab.tabId, { filters })}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, ownershipEvidenceTab.returnView)}
            onSortRulesChange={(sortRules) => setDetailTableControlState(ownershipEvidenceTab.tabId, { sortRules })}
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
        {remediationPackageTab ? (
          <RemediationPackageComponent
            key={remediationPackageTab.tabId}
            filters={getDetailTableControls(remediationPackageTab.tabId).filters}
            remediationPackage={remediationPackageTab.remediationPackage}
            sortRules={getDetailTableControls(remediationPackageTab.tabId).sortRules}
            onAzureRbacClick={(principal) => openAzureRbac(principal, remediationPackageTab.tabId)}
            onEntraPermissionsClick={(principal) => openEntraPermissions(principal, remediationPackageTab.tabId)}
            onFiltersChange={(filters) => setDetailTableControlState(remediationPackageTab.tabId, { filters })}
            onSortRulesChange={(sortRules) => setDetailTableControlState(remediationPackageTab.tabId, { sortRules })}
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

function getOwnershipEvidenceDetailTabId(selection: OwnershipEvidenceSelection): string {
  return `ownershipEvidence:${getOwnershipEvidenceTargetKey(selection)}`;
}

function getOwnershipEvidenceTargetKey(selection: OwnershipEvidenceSelection): string {
  const target = selection.target;

  if (target.kind === "resourceGroup") {
    return `resourceGroup:${target.subscriptionId}:${target.resourceGroup}`;
  }

  return `${target.kind}:${target.principalId}`;
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

function getAzureRbacTabDisplayName(tab: AzureRbacTab): string {
  if (tab.displayName.startsWith("RBAC: ")) {
    return tab.displayName;
  }

  return `RBAC: ${tab.displayName}`;
}

function getAzureRbacPrincipalTabId(objectId: string): string {
  return `azureRbac:servicePrincipal:${objectId}`;
}

function getAzureRbacResourceGroupTabId(selection: AzureRbacResourceGroupSelection): string {
  return `azureRbac:resourceGroup:${selection.subscriptionId}:${selection.resourceGroup}`;
}

function getEntraPermissionsTabId(objectId: string): string {
  return `entraPermissions:${objectId}`;
}

function getRemediationPackageTabId(packageId: string): string {
  return `remediationPackage:${packageId}`;
}

function getPrincipalDetailsTabId(objectId: string): string {
  return `principalDetails:${objectId}`;
}

function upsertTab<TTab extends { tabId: string }>(tabs: TTab[], tab: TTab): TTab[] {
  const tabIndex = tabs.findIndex((currentTab) => currentTab.tabId === tab.tabId);
  if (tabIndex < 0) {
    return [...tabs, tab];
  }

  return tabs.map((currentTab, currentIndex) => currentIndex === tabIndex ? tab : currentTab);
}

function removeRecordKey<TValue>(record: Record<string, TValue>, key: string): Record<string, TValue> {
  const { [key]: _removed, ...rest } = record;

  return rest;
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
