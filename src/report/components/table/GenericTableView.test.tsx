/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { GenericTableView } from "./GenericTableView";
import type { ReportFieldDescriptor } from "../../reportTypes";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

type Row = {
  id: string;
  name: string;
};

const fields: ReportFieldDescriptor<Row>[] = [
  {
    id: "name",
    label: "Name",
    valueType: "text",
    getValue: (row) => row.name
  }
];

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

test("resizes a table column from the header handle", () => {
  const { container, root } = renderComponent(
    <GenericTableView
      emptyMessage="No rows"
      fields={fields}
      getRowKey={(row) => row.id}
      minWidthClassName="min-w-[240px]"
      rows={[{ id: "1", name: "Example" }]}
    />
  );
  const resizeHandle = getButton(container, "Resize Name column");
  const headerCell = resizeHandle.closest("th");

  expect(headerCell).not.toBeNull();
  jest.spyOn(headerCell as HTMLTableCellElement, "getBoundingClientRect").mockReturnValue({
    bottom: 40,
    height: 40,
    left: 0,
    right: 160,
    top: 0,
    width: 160,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });

  act(() => {
    resizeHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 160, pointerId: 1 }));
    window.dispatchEvent(pointerEvent("pointermove", { clientX: 220, pointerId: 1 }));
    window.dispatchEvent(pointerEvent("pointerup", { clientX: 220, pointerId: 1 }));
  });

  expect((headerCell as HTMLTableCellElement).style.width).toBe("220px");
  expect(container.querySelector("td")?.getAttribute("style")).toBe("width: 220px;");

  act(() => root.unmount());
});

test("persists resized table columns by storage key", () => {
  const { container, root } = renderComponent(
    <GenericTableView
      columnWidthsStorageKey="test-table"
      emptyMessage="No rows"
      fields={fields}
      getRowKey={(row) => row.id}
      minWidthClassName="min-w-[240px]"
      rows={[{ id: "1", name: "Example" }]}
    />
  );
  const resizeHandle = getButton(container, "Resize Name column");
  const headerCell = resizeHandle.closest("th");

  expect(headerCell).not.toBeNull();
  jest.spyOn(headerCell as HTMLTableCellElement, "getBoundingClientRect").mockReturnValue({
    bottom: 40,
    height: 40,
    left: 0,
    right: 160,
    top: 0,
    width: 160,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });

  act(() => {
    resizeHandle.dispatchEvent(pointerEvent("pointerdown", { clientX: 160, pointerId: 1 }));
    window.dispatchEvent(pointerEvent("pointermove", { clientX: 230, pointerId: 1 }));
    window.dispatchEvent(pointerEvent("pointerup", { clientX: 230, pointerId: 1 }));
  });

  expect(window.localStorage.getItem("ownerlens:tableColumnWidths:test-table")).toBe("{\"name\":230}");

  act(() => root.unmount());
  document.body.innerHTML = "";

  const nextRender = renderComponent(
    <GenericTableView
      columnWidthsStorageKey="test-table"
      emptyMessage="No rows"
      fields={fields}
      getRowKey={(row) => row.id}
      minWidthClassName="min-w-[240px]"
      rows={[{ id: "1", name: "Example" }]}
    />
  );

  expect(getButton(nextRender.container, "Resize Name column").closest("th")?.getAttribute("style")).toBe(
    "width: 230px;"
  );

  act(() => nextRender.root.unmount());
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

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  if (!button) {
    throw new Error(`Missing button: ${label}`);
  }

  return button;
}

function pointerEvent(type: string, options: PointerEventInit): PointerEvent {
  if (typeof PointerEvent === "function") {
    return new PointerEvent(type, { bubbles: true, ...options });
  }

  return new MouseEvent(type, { bubbles: true, ...options }) as PointerEvent;
}
