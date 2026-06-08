import { useState } from "react";

import { ManagedIdentityComponent } from "./ManagedIdentityComponent";
import { ResourceGroupComponent } from "./ResourceGroupComponent";
import { ServicePrincipalComponent } from "./ServicePrincipalComponent";
import { Tabs, TabsList, TabsTrigger } from "../../report/components/ui/tabs";

type AzureView = "servicePrincipals" | "managedIdentities" | "resourceGroups";

export function AzureComponent() {
  const [activeView, setActiveView] = useState<AzureView>("servicePrincipals");

  return (
    <section className="flex flex-col gap-4">
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as AzureView)}>
        <TabsList aria-label="Azure data">
          <TabsTrigger value="resourceGroups">Resource groups</TabsTrigger>
          <TabsTrigger value="servicePrincipals">Service principals</TabsTrigger>
          <TabsTrigger value="managedIdentities">Managed identities</TabsTrigger>
        </TabsList>
      </Tabs>
      {activeView === "resourceGroups" ? <ResourceGroupComponent /> : null}
      {activeView === "servicePrincipals" ? <ServicePrincipalComponent /> : null}
      {activeView === "managedIdentities" ? <ManagedIdentityComponent /> : null}
    </section>
  );
}
