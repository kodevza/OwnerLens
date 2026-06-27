/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AzureRbacComponent } from "./AzureRbacComponent";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).fetch;
  document.body.innerHTML = "";
});

test("links assignment IDs to the Azure portal IAM view for their scope", async () => {
  const roleAssignmentId =
    "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.Authorization/roleAssignments/assignment-1";
  const scope = "/subscriptions/sub-1/resourceGroups/rg-app";
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    jsonResponse({
      collectionId: "azureRbac",
      columns: [],
      count: 1,
      page: 1,
      pageSize: 20,
      rows: [
        {
          accessDisplayName: "Owner on resource group rg-app",
          accessRisk: "high",
          accessResourceGroup: "rg-app",
          accessResourceId: null,
          accessScope: scope,
          accessScopeType: "ResourceGroup",
          accessSubscriptionId: "sub-1",
          canDelegate: false,
          condition: null,
          conditionVersion: null,
          principalDisplayName: "Test app",
          principalId: "sp-1",
          principalType: "ServicePrincipal",
          roleAssignmentId,
          roleDefinitionId: "owner-role-id",
          roleDefinitionName: "Owner",
          scope,
          scopeSubscriptionId: "sub-1",
          servicePrincipalId: "sp-1",
          signInName: null,
          subscriptionId: "sub-1",
          subscriptionName: "Platform"
        }
      ]
    })
  );

  const { container, root } = renderComponent(
    <AzureRbacComponent target={{ kind: "servicePrincipal", servicePrincipalId: "sp-1" }} />
  );
  await waitForText(container, roleAssignmentId);

  const link = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find(
    (candidate) => candidate.textContent?.trim() === roleAssignmentId
  );
  expect(link?.href).toBe(`https://portal.azure.com/#resource${scope}/users`);
  expect(link?.target).toBe("_blank");
  expect(link?.querySelector("svg")).not.toBeNull();

  act(() => root.unmount());
});

function renderComponent(component: React.ReactNode): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(component));

  return { container, root };
}

async function waitForText(container: HTMLElement, text: string): Promise<void> {
  const timeoutAt = Date.now() + 1000;
  while (Date.now() < timeoutAt) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    if (container.textContent?.includes(text)) {
      return;
    }
  }

  throw new Error(`Timed out waiting for text: ${text}. Rendered: ${container.textContent}`);
}

function jsonResponse(body: unknown): Response {
  return {
    json: async () => body,
    ok: true,
    status: 200
  } as Response;
}
