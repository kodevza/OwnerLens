import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import type { LocalReportRuntime } from "../LocalReportRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";
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
      path: `${restBasePath}/ownership/ownerCandidates/status`,
      handle: async ({ url }) => {
        const key = readRequiredSearchParam(url, "key");
        const status = readEvidenceStatusSearchParam(url);
        const disabled = status === "inactive";
        const disabledCount = await runtime.setOwnerCandidateDisabled(key, disabled);

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
    const { page, pageSize } = parseRuntimeCollectionQueryOptions(url);

    return {
      kind,
      subscriptionId: readRequiredSearchParam(url, "subscriptionId"),
      resourceGroup: readRequiredSearchParam(url, "resourceGroup"),
      page,
      pageSize
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

function readEvidenceStatusSearchParam(url: URL): "active" | "inactive" {
  const value = readRequiredSearchParam(url, "status").toLowerCase();
  if (value === "active" || value === "inactive") {
    return value;
  }

  if (value === "unactive") {
    return "inactive";
  }

  throw new RuntimeHttpError("Invalid ownership evidence status.", 400);
}
