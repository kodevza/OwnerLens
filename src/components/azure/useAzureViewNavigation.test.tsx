/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useAzureViewNavigation } from "./useAzureViewNavigation";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

type TestView = "alpha" | "beta" | "disabled";

const allViews: readonly TestView[] = ["alpha", "beta", "disabled"];
const enabledViews: readonly TestView[] = ["alpha", "beta"];

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

test("starts on the initial view and replaces current history state", () => {
  window.history.replaceState({ beforeOwnerLens: true }, "", "/ownerlens");
  const replaceStateSpy = jest.spyOn(window.history, "replaceState");

  const { root } = renderHarness();

  expect(screen()).toBe("alpha");
  expect(replaceStateSpy).toHaveBeenCalledWith({ ownerLensView: "alpha" }, "", "http://localhost/ownerlens");
  expect(window.history.state).toEqual({ ownerLensView: "alpha" });

  act(() => root.unmount());
});

test("activateView switches view and pushes history state", () => {
  window.history.replaceState({}, "", "/ownerlens");
  const pushStateSpy = jest.spyOn(window.history, "pushState");
  const { root } = renderHarness();

  clickView("beta");

  expect(screen()).toBe("beta");
  expect(pushStateSpy).toHaveBeenCalledWith({ ownerLensView: "beta" }, "", "http://localhost/ownerlens");
  expect(window.history.state).toEqual({ ownerLensView: "beta" });

  act(() => root.unmount());
});

test("ignores disabled views", () => {
  window.history.replaceState({}, "", "/ownerlens");
  const pushStateSpy = jest.spyOn(window.history, "pushState");
  const { root } = renderHarness();

  clickView("disabled");

  expect(screen()).toBe("alpha");
  expect(pushStateSpy).not.toHaveBeenCalled();
  expect(window.history.state).toEqual({ ownerLensView: "alpha" });

  act(() => root.unmount());
});

test("browser Back restores the previous in-app view while staying on the app URL", async () => {
  window.history.pushState({ beforeOwnerLens: true }, "", "/before-ownerlens");
  window.history.pushState({}, "", "/ownerlens");
  const { root } = renderHarness();

  clickView("beta");
  expect(screen()).toBe("beta");

  await goBack();

  await waitFor(() => {
    expect(screen()).toBe("alpha");
  });
  expect(window.location.pathname).toBe("/ownerlens");

  act(() => root.unmount());
});

test("Backspace outside editable fields prevents browser navigation and navigates back when possible", () => {
  window.history.replaceState({}, "", "/ownerlens");
  const { root } = renderHarness();

  clickView("beta");
  expect(screen()).toBe("beta");

  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });
  act(() => {
    window.dispatchEvent(event);
  });

  expect(event.defaultPrevented).toBe(true);
  expect(screen()).toBe("alpha");

  act(() => root.unmount());
});

test("Backspace inside editable inputs, textareas, and contenteditable elements is not prevented", () => {
  window.history.replaceState({}, "", "/ownerlens");
  const { root } = renderHarness();

  clickView("beta");
  expect(screen()).toBe("beta");

  for (const element of createEditableElements()) {
    document.body.appendChild(element);
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });

    act(() => {
      element.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(screen()).toBe("beta");
    element.remove();
  }

  act(() => root.unmount());
});

function Harness({ initialView = "alpha" }: { initialView?: TestView }) {
  const { activeView, activateView } = useAzureViewNavigation(initialView, enabledViews);

  return (
    <div>
      <output aria-label="active view">{activeView}</output>
      {allViews.map((view) => (
        <button key={view} type="button" onClick={() => activateView(view)}>
          {view}
        </button>
      ))}
    </div>
  );
}

function renderHarness(initialView?: TestView): { root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Harness initialView={initialView} />);
  });

  return { root };
}

function screen(): string {
  const activeView = document.querySelector("output[aria-label='active view']");
  if (!activeView?.textContent) {
    throw new Error("Active view output was not rendered.");
  }

  return activeView.textContent;
}

function clickView(view: TestView): void {
  const button = Array.from(document.querySelectorAll("button")).find((candidate) => candidate.textContent === view);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button for view ${view} was not rendered.`);
  }

  act(() => {
    button.click();
  });
}

function createEditableElements(): HTMLElement[] {
  const input = document.createElement("input");
  input.type = "text";
  input.value = "filter";

  const textarea = document.createElement("textarea");
  textarea.value = "filter";

  const contentEditable = document.createElement("div");
  contentEditable.setAttribute("contenteditable", "true");
  contentEditable.textContent = "filter";

  return [input, textarea, contentEditable];
}

async function waitFor(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

async function goBack(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
      window.history.back();
    });
  });
}
