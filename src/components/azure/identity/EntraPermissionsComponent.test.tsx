/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EntraPermissionsComponent } from "./EntraPermissionsComponent";

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

test("links assignment IDs to the enterprise application permissions page", async () => {
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    jsonResponse({
      principalId: "sp object 1",
      oauth2PermissionGrants: [
        {
          id: "grant-1",
          clientId: "sp object 1",
          consentType: "AllPrincipals",
          principalId: null,
          resourceId: "graph-sp-id",
          risk: "high",
          scope: "User.Read"
        }
      ],
      appRoleAssignments: [
        {
          id: "assignment-1",
          appRoleId: "role-1",
          appRoleDisplayName: "Read directory data",
          appRoleValue: "Directory.Read.All",
          principalId: "sp object 1",
          principalDisplayName: "Test app",
          resourceId: "graph-sp-id",
          resourceDisplayName: "Microsoft Graph"
        }
      ]
    })
  );

  const { container, root } = renderComponent(
    <EntraPermissionsComponent appId="client app 1" principalId="sp object 1" />
  );
  await waitForText(container, "assignment-1");

  const assignmentLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).filter((link) =>
    ["grant-1", "assignment-1"].includes(link.textContent?.trim() ?? "")
  );

  expect(assignmentLinks).toHaveLength(2);
  for (const link of assignmentLinks) {
    expect(link.href).toBe(
      "https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/objectId/sp%20object%201/appId/client%20app%201"
    );
    expect(link.target).toBe("_blank");
    expect(link.querySelector("svg")).not.toBeNull();
  }

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
