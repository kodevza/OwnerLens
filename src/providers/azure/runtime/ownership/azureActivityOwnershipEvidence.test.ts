import type { EntraServicePrincipal } from "../../inputTransferObject/generated/EntraSnapshot";
import { buildServicePrincipalIndex, describeIdentity } from "./azureActivityOwnershipEvidence";

test("describes service principals from generated Entra snapshot DTOs", () => {
  const servicePrincipal: EntraServicePrincipal = {
    id: "sp-1",
    appId: "app-1",
    displayName: "Payroll API",
    appDisplayName: "Payroll",
    servicePrincipalType: "Application",
    publisherName: null,
    accountEnabled: true,
    appOwnerOrganizationId: "tenant-1",
    homepage: null,
    loginUrl: null,
    replyUrls: [],
    servicePrincipalNames: [],
    tags: []
  };

  const index = buildServicePrincipalIndex([servicePrincipal]);

  expect(describeIdentity("APP-1", index)).toBe("Payroll API (app-1)");
});
