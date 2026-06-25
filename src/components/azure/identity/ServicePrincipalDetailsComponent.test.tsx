/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ServicePrincipal } from "../../../core/azure/entra/servicePrincipal";
import { ServicePrincipalDetailsComponent } from "./ServicePrincipalDetailsComponent";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  jest.useRealTimers();
});

test("renders external HTTP values as direct links", () => {
  const { root } = renderComponent(
    <ServicePrincipalDetailsComponent
      servicePrincipal={servicePrincipal({
        homepage: "https://app.example.test/home",
        loginUrl: "not-a-url",
        replyUrls: ["https://app.example.test/callback", "urn:ietf:wg:oauth:2.0:oob"]
      })}
    />
  );

  const homepageLink = getLink("https://app.example.test/home");
  expect(homepageLink.getAttribute("href")).toBe("https://app.example.test/home");
  expect(homepageLink.getAttribute("target")).toBe("_blank");
  expect(homepageLink.getAttribute("rel")).toBe("noreferrer");
  expect(homepageLink.getAttribute("title")).toBe("Open external resource: https://app.example.test/home");

  expect(getLink("https://app.example.test/callback").getAttribute("target")).toBe("_blank");
  expect(findLink("not-a-url")).toBeUndefined();
  expect(findLink("urn:ietf:wg:oauth:2.0:oob")).toBeUndefined();

  act(() => root.unmount());
});

test("copies object ID from the generic copy action", async () => {
  jest.useFakeTimers();
  const writeText = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  const { root } = renderComponent(<ServicePrincipalDetailsComponent servicePrincipal={servicePrincipal()} />);

  await act(async () => {
    getButton("Copy Object ID").click();
  });

  expect(writeText).toHaveBeenCalledWith("sp-object-id");
  expect(getButton("Copy Object ID").getAttribute("title")).toBe("Copied");

  act(() => {
    jest.runOnlyPendingTimers();
    root.unmount();
  });
});

test("opens permission and RBAC tables from detail badges instead of rendering role assignment JSON", async () => {
  const onAzureRbacClick = jest.fn();
  const onEntraPermissionsClick = jest.fn();
  const roleAssignment = {
    assignmentSource: "direct" as const,
    canDelegate: null,
    condition: null,
    conditionVersion: null,
    principalDisplayName: "Details app",
    principalId: "sp-object-id",
    principalType: "ServicePrincipal",
    roleAssignmentId: "assignment-id",
    roleDefinitionId: "role-definition-id",
    roleDefinitionName: "Owner",
    scope: "/subscriptions/sub-1/resourceGroups/rg-app",
    scopeResourceGroup: "rg-app",
    scopeSubscriptionId: "sub-1",
    scopeType: "ResourceGroup" as const,
    signInName: null,
    subscriptionId: "sub-1",
    subscriptionName: "Production"
  };
  const { container, root } = renderComponent(
    <ServicePrincipalDetailsComponent
      servicePrincipal={servicePrincipal({
        appRolesPermissionCount: 2,
        rbacRoleAssignmentCount: 1,
        rbacRoleLevel: "high",
        rbacSubscriptionCount: 1,
        roleAssignments: [roleAssignment]
      })}
      onAzureRbacClick={onAzureRbacClick}
      onEntraPermissionsClick={onEntraPermissionsClick}
    />
  );

  await act(async () => {
    getButton("Open Entra API permissions 2").click();
  });
  expect(onEntraPermissionsClick).toHaveBeenCalledWith({ displayName: "Details app", objectId: "sp-object-id" });

  await act(async () => {
    getButton("Open Azure RBAC assignments 1").click();
  });
  expect(onAzureRbacClick).toHaveBeenCalledWith({ displayName: "Details app", objectId: "sp-object-id" });

  await act(async () => {
    getButton("Open role assignments 1").click();
  });
  expect(onAzureRbacClick).toHaveBeenCalledTimes(2);
  expect(container.querySelector("pre")?.textContent ?? "").not.toContain("roleAssignmentId");

  act(() => root.unmount());
});

test("renders owner fields as one ownership evidence badge", async () => {
  const onOwnershipEvidenceClick = jest.fn();
  const { container, root } = renderComponent(
    <ServicePrincipalDetailsComponent
      servicePrincipal={servicePrincipal({
        ownerCandidates: [
          {
            key: "ownerUser:alice@example.test",
            displayName: "alice@example.test",
            type: "ownerUser",
            confidence: "high",
            source: "entraServicePrincipalOwner",
            rank: 0,
            evidence: [],
            relatedScopes: []
          },
          {
            key: "ownerGroup:platform-team",
            displayName: "platform-team",
            type: "ownerGroup",
            confidence: "medium",
            source: "entraApplicationOwner",
            rank: 1,
            evidence: [],
            relatedScopes: []
          }
        ],
        ownerConfidence: "high",
        potentialOwners: ["alice@example.test", "platform-team"]
      })}
      onOwnershipEvidenceClick={onOwnershipEvidenceClick}
    />
  );

  expect(container.textContent).toContain("Owner candidates");
  expect(container.textContent).toContain("alice@example.test · ownerUser (+1)");
  expect(container.textContent).not.toContain("Owner confidence");
  expect(container.querySelector("pre")?.textContent ?? "").not.toContain("alice@example.test");

  await act(async () => {
    getButton("Open ownership evidence for alice@example.test").click();
  });

  expect(onOwnershipEvidenceClick).toHaveBeenCalledWith({
    displayName: "Details app",
    target: {
      kind: "servicePrincipal",
      principalId: "sp-object-id"
    }
  });

  act(() => root.unmount());
});

function servicePrincipal(input: Partial<ServicePrincipal> = {}): ServicePrincipal {
  return {
    accountEnabled: true,
    appDisplayName: "Details app",
    appId: "client-id",
    appOwnerOrganizationId: null,
    appRolesPermissionCount: 0,
    displayName: "Details app",
    entraPermissionRisk: "none",
    homepage: null,
    id: "sp-object-id",
    loginUrl: null,
    oauthPermissionsCount: 0,
    permissionRisk: "none",
    publisherName: null,
    rbacRoleAssignmentCount: 0,
    rbacRoleLevel: "none",
    rbacSubscriptionCount: 0,
    replyUrls: [],
    roleAssignments: [],
    servicePrincipalNames: [],
    servicePrincipalType: "Application",
    tags: {},
    ztaMaxRisk: "none",
    ztaRemediationCountAll: 0,
    ztaRemediationFailedCount: 0,
    ...input
  } as ServicePrincipal;
}

function renderComponent(component: React.ReactNode): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return { container, root };
}

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.getAttribute("aria-label") === label || element.textContent?.trim() === label
  );
  if (!button) {
    throw new Error(`Could not find button: ${label}`);
  }

  return button;
}

function getLink(text: string): HTMLAnchorElement {
  const link = findLink(text);

  if (!link) {
    throw new Error(`Could not find link: ${text}`);
  }

  return link;
}

function findLink(text: string): HTMLAnchorElement | undefined {
  return [...document.querySelectorAll<HTMLAnchorElement>("a")].find((element) => element.textContent?.includes(text));
}
