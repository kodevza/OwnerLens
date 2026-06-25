/**
 * @jest-environment jsdom
 */
import { generatePowerShellScript, generateResourceGroupPowerShellScript } from "./api";

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).fetch;
});

test("generates resource group owner tag scripts for selected row keys", async () => {
  const fetchMock = mockPowerShellScriptFetch();
  globalThis.fetch = fetchMock;

  await generateResourceGroupPowerShellScript({
    templateId: "setResourceGroupOwnerGroupTag",
    selection: {
      filters: {
        owner: {
          type: "objectFields",
          conditions: [{ fieldId: "confidence", value: "high" }]
        }
      },
      selectAllMatchingFilters: false,
      selectedRowKeys: ["sub-1:rg-app"],
      sortRules: [{ columnId: "resourceGroup", direction: "asc" }]
    }
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin);
  expect(requestUrl.pathname).toBe("/api/data/scripts/powershell");
  expect(requestUrl.searchParams.get("collection")).toBe("azureResources.resourceGroupOwnership");
  expect(requestUrl.searchParams.get("template")).toBe("setResourceGroupOwnerGroupTag");
  expect(requestUrl.searchParams.get("owner")).toBeNull();
  expect(requestUrl.searchParams.get("tagName")).toBeNull();
  expect(requestUrl.searchParams.get("filter[0][column]")).toBe("owner.confidence");
  expect(requestUrl.searchParams.get("filter[0][value][0]")).toBe("high");
  expect(requestUrl.searchParams.getAll("selectedRowKey")).toEqual(["sub-1:rg-app"]);
  expect(requestUrl.searchParams.get("sort[0][column]")).toBe("resourceGroup");
  expect(requestUrl.searchParams.get("sort[0][direction]")).toBe("asc");
});

test("generates resource group owner tag scripts for all filtered rows without selected ids", async () => {
  const fetchMock = mockPowerShellScriptFetch();
  globalThis.fetch = fetchMock;

  await generateResourceGroupPowerShellScript({
    templateId: "setResourceGroupOwnerTag",
    selection: {
      filters: {
        tags: {
          type: "text",
          value: "prod"
        }
      },
      selectAllMatchingFilters: true,
      selectedRowKeys: ["sub-1:rg-app"]
    }
  });

  const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin);
  expect(requestUrl.searchParams.get("filter[0][column]")).toBe("tags");
  expect(requestUrl.searchParams.get("filter[0][value][0]")).toBe("prod");
  expect(requestUrl.searchParams.getAll("selectedRowKey")).toEqual([]);
});

test("generates service principal owner tag scripts for the service principal collection", async () => {
  const fetchMock = mockPowerShellScriptFetch();
  globalThis.fetch = fetchMock;

  await generatePowerShellScript({
    collectionId: "entra.servicePrincipals",
    templateId: "setServicePrincipalOwnerTag",
    selection: {
      filters: {},
      selectAllMatchingFilters: false,
      selectedRowKeys: ["sp-1"]
    }
  });

  const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin);
  expect(requestUrl.searchParams.get("collection")).toBe("entra.servicePrincipals");
  expect(requestUrl.searchParams.get("template")).toBe("setServicePrincipalOwnerTag");
  expect(requestUrl.searchParams.getAll("selectedRowKey")).toEqual(["sp-1"]);
});

function mockPowerShellScriptFetch(): jest.MockedFunction<typeof fetch> {
  return jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    ({
      headers: new Headers({
        "Content-Type": "application/json"
      }),
      json: async () => ({
        body: "Set-AzResourceGroup",
        contentType: "text/x-powershell; charset=utf-8",
        count: 1,
        fileName: "ownerlens-set-resource-group-owner.ps1",
        kind: "powershellScript",
        targetIds: ["sub-1:rg-app"],
        templateId: "setResourceGroupOwnerTag"
      }),
      ok: true,
      status: 200
    }) as Response
  );
}
