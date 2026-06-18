import { useCallback, useEffect, useRef, useState } from "react";

import type { ZtaRelatedObject } from "../../core/azure/ztaReport";
import { appConfig } from "../../core/config";
import { createViewHistoryState, getHistoryStateView } from "../../lib/historyState";
import type { RemediationPackage } from "../../core/runtime/remediation";
import type { ColumnFilters } from "../../core/collectionControls";
import { ClosableTab } from "../../report/components/ClosableTab";
import { Tabs, TabsList, TabsTrigger } from "../../report/components/ui/tabs";
import { AzureRbacComponent } from "./AzureRbacComponent";
import { EntraPermissionsComponent } from "./EntraPermissionsComponent";
import { ManagedIdentityComponent } from "./ManagedIdentityComponent";
import { OwnershipEvidenceComponent } from "./OwnershipEvidenceComponent";
import { RemediationPackageComponent } from "./RemediationPackageComponent";
import { ResourceGroupComponent, type AzureRbacResourceGroupSelection } from "./ResourceGroupComponent";
import { ServicePrincipalComponent } from "./ServicePrincipalComponent";
import type {
  AzureRbacPrincipalSelection,
  EntraPermissionsPrincipalSelection,
  OwnershipEvidenceSelection
} from "./ServicePrincipalFieldRenderers";
import { ZtaComponent } from "./ZtaComponent";

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

type PrincipalObjectFilter = {
  objectId: string;
  view: Extract<AzureView, "servicePrincipals" | "managedIdentities">;
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
  const [activeView, setActiveView] = useState<AzureView>("servicePrincipals");
  const [azureRbacTab, setAzureRbacTab] = useState<AzureRbacTab | null>(null);
  const [entraPermissionsTab, setEntraPermissionsTab] = useState<EntraPermissionsTab | null>(null);
  const [ownershipEvidenceTab, setOwnershipEvidenceTab] = useState<OwnershipEvidenceTab | null>(null);
  const [remediationPackageTab, setRemediationPackageTab] = useState<RemediationPackageTab | null>(null);
  const [principalObjectFilter, setPrincipalObjectFilter] = useState<PrincipalObjectFilter | null>(null);
  const [ztaRelatedObjectFilter, setZtaRelatedObjectFilter] = useState<string | null>(null);
  const activeViewRef = useRef<AzureView>("servicePrincipals");
  const viewHistoryRef = useRef<AzureView[]>([]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  const activateView = useCallback((nextView: AzureView) => {
    if (!enabledViewValues.includes(nextView)) {
      return;
    }

    const currentView = activeViewRef.current;
    if (nextView === currentView) {
      return;
    }

    viewHistoryRef.current = [...viewHistoryRef.current, currentView];
    activeViewRef.current = nextView;
    setActiveView(nextView);
    window.history.pushState(createViewHistoryState(nextView), "", window.location.href);
  }, []);

  const navigateBack = useCallback((): boolean => {
    const previousView = viewHistoryRef.current.pop();
    if (!previousView) {
      return false;
    }

    activeViewRef.current = previousView;
    setActiveView(previousView);
    return true;
  }, []);

  useEffect(() => {
    window.history.replaceState(createViewHistoryState(activeViewRef.current), "", window.location.href);

    function handlePopState(event: PopStateEvent) {
      const previousView = getHistoryStateView(event.state, enabledViewValues);
      if (!previousView) {
        return;
      }

      const previousViewIndex = viewHistoryRef.current.lastIndexOf(previousView);
      if (previousViewIndex >= 0) {
        viewHistoryRef.current = viewHistoryRef.current.slice(0, previousViewIndex);
      }

      activeViewRef.current = previousView;
      setActiveView(previousView);
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Backspace" || event.defaultPrevented || isEditableBackspaceTarget(event.target)) {
        return;
      }

      event.preventDefault();
      navigateBack();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigateBack]);

  function openRelatedPrincipal(relatedObject: ZtaRelatedObject) {
    const view = getRelatedPrincipalView(relatedObject);
    if (!view) {
      return;
    }

    const objectId = getRelatedPrincipalObjectId(relatedObject);
    if (!objectId) {
      return;
    }

    setPrincipalObjectFilter({ objectId, view });
    activateView(view);
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

  return (
    <section className="flex flex-col">
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
              closeLabel={`Close ${ownershipEvidenceTab.displayName} ownership evidence tab`}
              label={`${ownershipEvidenceTab.displayName} owners`}
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
      <div className="relative z-0">
        {activeView === "resourceGroups" ? (
          <ResourceGroupComponent
            onAzureRbacClick={openResourceGroupAzureRbac}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, "resourceGroups")}
          />
        ) : null}
        {activeView === "servicePrincipals" ? (
          <ServicePrincipalComponent
            initialFilters={getPrincipalObjectFilters(principalObjectFilter, "servicePrincipals")}
            onAzureRbacClick={(principal) => openAzureRbac(principal, "servicePrincipals")}
            onEntraPermissionsClick={(principal) => openEntraPermissions(principal, "servicePrincipals")}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, "servicePrincipals")}
            onRemediationPackageClick={(remediationPackage) => openRemediationPackage(remediationPackage, "servicePrincipals")}
            onZtaRemediationsClick={openZtaRelatedObject}
          />
        ) : null}
        {activeView === "managedIdentities" ? (
          <ManagedIdentityComponent
            initialFilters={getPrincipalObjectFilters(principalObjectFilter, "managedIdentities")}
            onAzureRbacClick={(principal) => openAzureRbac(principal, "managedIdentities")}
            onEntraPermissionsClick={(principal) => openEntraPermissions(principal, "managedIdentities")}
            onOwnershipEvidenceClick={(selection) => openOwnershipEvidence(selection, "managedIdentities")}
            onRemediationPackageClick={(remediationPackage) => openRemediationPackage(remediationPackage, "managedIdentities")}
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
            displayName={ownershipEvidenceTab.displayName}
            target={ownershipEvidenceTab.target}
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

function getPrincipalObjectFilters(
  principalObjectFilter: PrincipalObjectFilter | null,
  view: PrincipalObjectFilter["view"]
): ColumnFilters | undefined {
  if (!principalObjectFilter || principalObjectFilter.view !== view) {
    return undefined;
  }

  return {
    id: {
      type: "text",
      value: principalObjectFilter.objectId
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

function getRelatedPrincipalView(relatedObject: ZtaRelatedObject): PrincipalObjectFilter["view"] | null {
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

function isEditableBackspaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const editableElement = target.closest("input, textarea, [contenteditable]");
  if (!(editableElement instanceof HTMLElement)) {
    return false;
  }

  if (editableElement instanceof HTMLTextAreaElement) {
    return !editableElement.disabled && !editableElement.readOnly;
  }

  if (editableElement instanceof HTMLInputElement) {
    return !editableElement.disabled && !editableElement.readOnly && isTextInputType(editableElement.type);
  }

  return editableElement.isContentEditable;
}

function isTextInputType(type: string): boolean {
  return [
    "",
    "email",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "url"
  ].includes(type);
}
