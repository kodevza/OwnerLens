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
