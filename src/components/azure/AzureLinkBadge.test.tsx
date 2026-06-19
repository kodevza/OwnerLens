import { renderToStaticMarkup } from "react-dom/server";

import { AzureLinkBadge, buildAzureResourceGroupPortalUrl } from "./AzureLinkBadge";

test("builds Azure portal URL for a resource group", () => {
  expect(
    buildAzureResourceGroupPortalUrl({
      resourceGroup: "rg app",
      subscriptionId: "sub-1"
    })
  ).toBe("https://portal.azure.com/#resource/subscriptions/sub-1/resourceGroups/rg%20app/overview");
});

test("renders Azure link badge as an unstyled external portal link", () => {
  const href = buildAzureResourceGroupPortalUrl({
    resourceGroup: "rg-app",
    subscriptionId: "sub-1"
  });
  const html = renderToStaticMarkup(
    <AzureLinkBadge href={href} title="Go to: /subscriptions/sub-1/resourceGroups/rg-app">
      rg-app
    </AzureLinkBadge>
  );

  expect(html).toContain('href="https://portal.azure.com/#resource/subscriptions/sub-1/resourceGroups/rg-app/overview"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noreferrer"');
  expect(html).toContain('title="Go to: /subscriptions/sub-1/resourceGroups/rg-app"');
  expect(html).toContain("rg-app");
  expect(html).not.toContain("rounded-full");
});
