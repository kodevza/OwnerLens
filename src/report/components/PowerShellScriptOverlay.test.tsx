/**
 * @jest-environment jsdom
 */
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { PowerShellScriptOverlay } from "./PowerShellScriptOverlay";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined
  });
});

test("generates an editable PowerShell script overlay from a template dropdown and copies edited content", async () => {
  const writeText = jest.fn<Promise<void>, [string]>(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  const generateOwnerTag = jest.fn(async () => ({
    body: "Set-Owner -Tag 'owner'",
    count: 2,
    fileName: "ownerlens-set-resource-group-owner.ps1"
  }));
  const generateOwnerGroupTag = jest.fn(async () => ({
    body: "Set-Owner -Tag 'ownerGroup'",
    count: 2,
    fileName: "ownerlens-set-resource-group-owner-group.ps1"
  }));
  const { root } = renderComponent(
    <PowerShellScriptOverlay
      action={{
        selectionLabel: "2 selected resource groups",
        templates: [
          {
            id: "setResourceGroupOwnerTag",
            label: "Set owner tag",
            generate: generateOwnerTag
          },
          {
            id: "setResourceGroupOwnerGroupTag",
            label: "Set ownerGroup tag",
            generate: generateOwnerGroupTag
          }
        ]
      }}
    />
  );

  await clickButton("Open PowerShell script templates for 2 selected resource groups");
  await clickButton("Set ownerGroup tag");
  const dialog = getDialog("PowerShell script");
  expect(dialog.parentElement?.parentElement).toBe(document.body);

  await waitFor(() => {
    expect(generateOwnerTag).not.toHaveBeenCalled();
    expect(generateOwnerGroupTag).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("ownerlens-set-resource-group-owner-group.ps1 - 2 targets");
  });

  const textarea = getTextarea("Generated PowerShell script");
  expect(textarea.value).toBe("Set-Owner -Tag 'ownerGroup'");

  await changeTextarea("Generated PowerShell script", "edited script body");
  await clickButton("Copy PowerShell script");

  await waitFor(() => {
    expect(writeText).toHaveBeenCalledWith("edited script body");
    expect(document.body.textContent).toContain("Copied.");
  });

  act(() => root.unmount());
});

function renderComponent(component: ReactNode): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return { container, root };
}

async function clickButton(label: string): Promise<void> {
  await act(async () => {
    const button = getButton(label);
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    button.click();
  });
}

async function changeTextarea(label: string, value: string): Promise<void> {
  const textarea = getTextarea(label);
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(textarea, "value")?.set;
    const prototype = Object.getPrototypeOf(textarea) as HTMLTextAreaElement;
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(textarea, value);
    } else if (valueSetter) {
      valueSetter.call(textarea, value);
    } else {
      textarea.value = value;
    }
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button ${label}.`);
  }

  return button;
}

function getTextarea(label: string): HTMLTextAreaElement {
  const textarea = [...document.querySelectorAll("textarea")].find(
    (candidate) => candidate.getAttribute("aria-label") === label
  );
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error(`Expected textarea ${label}.`);
  }

  return textarea;
}

function getDialog(label: string): HTMLElement {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
    (candidate) => candidate.getAttribute("aria-label") === label
  );
  if (!(dialog instanceof HTMLElement)) {
    throw new Error(`Expected dialog ${label}.`);
  }

  return dialog;
}

async function waitFor(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }

  throw lastError;
}
