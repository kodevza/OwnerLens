import { renderToStaticMarkup } from "react-dom/server";

import {
  EntraLinkBadge,
  buildEntraEnterpriseApplicationPermissionsPortalUrl,
  buildEntraEnterpriseApplicationPortalUrl
} from "./EntraLinkBadge";

test("builds Entra portal URL for an enterprise application", () => {
  expect(
    buildEntraEnterpriseApplicationPortalUrl({
      appId: "client 1",
      objectId: "sp object 1"
    })
  ).toBe(
    "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/sp%20object%201/appId/client%201"
  );
});

test("builds Entra portal URL with only an object ID", () => {
  expect(
    buildEntraEnterpriseApplicationPortalUrl({
      objectId: "sp-object-1"
    })
  ).toBe("https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/sp-object-1");
});

test("builds Entra permissions portal URL for an enterprise application", () => {
  expect(
    buildEntraEnterpriseApplicationPermissionsPortalUrl({
      appId: "client 1",
      objectId: "sp object 1"
    })
  ).toBe(
    "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/objectId/sp%20object%201/appId/client%201"
  );
});

test("builds Entra permissions portal URL with only an object ID", () => {
  expect(
    buildEntraEnterpriseApplicationPermissionsPortalUrl({
      objectId: "sp-object-1"
    })
  ).toBe("https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/objectId/sp-object-1");
});

test("renders Entra link badge as an unstyled external portal link", () => {
  const href = buildEntraEnterpriseApplicationPortalUrl({
    appId: "client-1",
    objectId: "sp-object-1"
  });
  const html = renderToStaticMarkup(
    <EntraLinkBadge href={href} title="Open in Microsoft Entra admin center: Test app">
      Test app
    </EntraLinkBadge>
  );

  expect(html).toContain(
    'href="https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/sp-object-1/appId/client-1"'
  );
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noreferrer"');
  expect(html).toContain('title="Open in Microsoft Entra admin center: Test app"');
  expect(html).toContain("Test app");
  expect(html).not.toContain("rounded-full");
});
