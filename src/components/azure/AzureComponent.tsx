import { useState } from "react";

import type { ZtaRelatedObject } from "../../core/azure/ztaReport";
import type { ColumnFilters } from "../../report/components/reportTableControls";
import { Tabs, TabsList, TabsTrigger } from "../../report/components/ui/tabs";
import { ManagedIdentityComponent } from "./ManagedIdentityComponent";
import { ResourceGroupComponent } from "./ResourceGroupComponent";
import { ServicePrincipalComponent } from "./ServicePrincipalComponent";
import { ZtaComponent } from "./ZtaComponent";

type AzureView = "servicePrincipals" | "managedIdentities" | "resourceGroups" | "zeroTrustAssessment";

type PrincipalObjectFilter = {
  objectId: string;
  view: Extract<AzureView, "servicePrincipals" | "managedIdentities">;
};

export function AzureComponent() {
  const [activeView, setActiveView] = useState<AzureView>("servicePrincipals");
  const [principalObjectFilter, setPrincipalObjectFilter] = useState<PrincipalObjectFilter | null>(null);
  const [ztaRelatedObjectFilter, setZtaRelatedObjectFilter] = useState<string | null>(null);

  function openRelatedPrincipal(relatedObject: ZtaRelatedObject) {
    const objectId = relatedObject.id ?? relatedObject.object_id;
    if (!objectId) {
      return;
    }

    const view = relatedObject.servicePrincipalType === "ManagedIdentity" ? "managedIdentities" : "servicePrincipals";
    setPrincipalObjectFilter({ objectId, view });
    setActiveView(view);
  }

  function openZtaRelatedObject(objectId: string) {
    setZtaRelatedObjectFilter(objectId);
    setActiveView("zeroTrustAssessment");
  }

  return (
    <section className="flex flex-col gap-4">
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as AzureView)}>
        <TabsList aria-label="Azure data">
          <TabsTrigger value="resourceGroups">Resource groups</TabsTrigger>
          <TabsTrigger value="servicePrincipals">Service principals</TabsTrigger>
          <TabsTrigger value="managedIdentities">Managed identities</TabsTrigger>
          <TabsTrigger value="zeroTrustAssessment">Zero Trust Assessment</TabsTrigger>
        </TabsList>
      </Tabs>
      {activeView === "resourceGroups" ? <ResourceGroupComponent /> : null}
      {activeView === "servicePrincipals" ? (
        <ServicePrincipalComponent
          initialFilters={getPrincipalObjectFilters(principalObjectFilter, "servicePrincipals")}
          onZtaRemediationsClick={openZtaRelatedObject}
        />
      ) : null}
      {activeView === "managedIdentities" ? (
        <ManagedIdentityComponent
          initialFilters={getPrincipalObjectFilters(principalObjectFilter, "managedIdentities")}
          onZtaRemediationsClick={openZtaRelatedObject}
        />
      ) : null}
      {activeView === "zeroTrustAssessment" ? (
        <ZtaComponent initialFilters={getZtaRelatedObjectFilters(ztaRelatedObjectFilter)} onRelatedObjectClick={openRelatedPrincipal} />
      ) : null}
    </section>
  );
}

function getZtaRelatedObjectFilters(objectId: string | null): ColumnFilters | undefined {
  if (!objectId) {
    return undefined;
  }

  return {
    RelatedObjects: {
      type: "text",
      value: objectId
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
