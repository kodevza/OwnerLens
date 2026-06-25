/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RuntimeErrorToast } from "./RuntimeErrorToast";
import { runtimeApiErrorEventName } from "./api";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

test("shows runtime API errors as a dismissible toast", () => {
  const { container, root } = renderComponent(<RuntimeErrorToast />);

  act(() => {
    window.dispatchEvent(
      new CustomEvent(runtimeApiErrorEventName, {
        detail: {
          code: "runtime.schemaVersionIncompatible",
          message: "Runtime database schema is newer than this OwnerLens version."
        }
      })
    );
  });

  expect(container.textContent).toContain("Runtime API error");
  expect(container.textContent).toContain("Runtime database schema is newer than this OwnerLens version.");

  act(() => {
    getButton("Dismiss runtime API error").click();
  });

  expect(container.textContent).not.toContain("Runtime API error");

  act(() => root.unmount());
});

function renderComponent(component: React.ReactNode): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return { container, root };
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === label
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}
