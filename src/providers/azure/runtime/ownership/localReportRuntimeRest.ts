import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import type { LocalReportRuntime } from "../LocalReportRuntime";
import type { OwnershipEvidenceRequest } from "./OwnershipEvidenceQueryService";

export function defineOwnershipLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      path: `${restBasePath}/ownership/evidence`,
      handle: ({ url }) => runtime.readOwnershipEvidence(parseOwnershipEvidenceRequest(url))
    },
    {
      path: `${restBasePath}/ownership/evidence/status`,
      handle: async ({ url }) => {
        const key = readRequiredSearchParam(url, "key");
        const status = readEvidenceStatusSearchParam(url);
        const disabled = status === "unactive";
        const disabledCount = await runtime.setOwnerEvidenceDisabled(key, disabled);

        return {
          key,
          status,
          disabled,
          disabledCount
        };
      }
    }
  ];
}

function parseOwnershipEvidenceRequest(url: URL): OwnershipEvidenceRequest {
  const kind = readRequiredSearchParam(url, "kind");

  if (kind === "servicePrincipal" || kind === "managedIdentity") {
    return {
      kind,
      principalId: readRequiredSearchParam(url, "principalId")
    };
  }

  if (kind === "resourceGroup") {
    return {
      kind,
      subscriptionId: readRequiredSearchParam(url, "subscriptionId"),
      resourceGroup: readRequiredSearchParam(url, "resourceGroup")
    };
  }

  throw new RuntimeHttpError("Invalid ownership evidence target kind.", 400);
}

function readRequiredSearchParam(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    throw new RuntimeHttpError(`Missing required query parameter: ${name}`, 400);
  }

  return value;
}

function readEvidenceStatusSearchParam(url: URL): "active" | "unactive" {
  const value = readRequiredSearchParam(url, "status").toLowerCase();
  if (value === "active" || value === "unactive") {
    return value;
  }

  throw new RuntimeHttpError("Invalid ownership evidence status.", 400);
}
