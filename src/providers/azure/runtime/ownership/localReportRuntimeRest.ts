import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import {
  ownerCandidateStatusQuerySchema,
  ownerCandidateStatusResponseSchema,
  ownershipEvidenceQuerySchema,
  ownershipEvidenceResponseSchema
} from "../../../../core/runtime/restSchemas";
import type { LocalReportRuntimeRestRuntime } from "../localReportRuntimeRestRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";

type OwnershipEvidenceRequest =
  | {
      kind: "servicePrincipal" | "managedIdentity";
      azureRbac?: boolean;
      principalId: string;
    }
  | {
      kind: "resourceGroup";
      azureRbac?: boolean;
      subscriptionId: string;
      resourceGroup: string;
      page?: number;
      pageSize?: number;
    };

export function defineOwnershipLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntimeRestRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      operationId: "readOwnershipEvidence",
      tags: ["Ownership"],
      summary: "Read owner evidence for a service principal, managed identity, or resource group.",
      path: `${restBasePath}/ownership/evidence`,
      querySchema: ownershipEvidenceQuerySchema,
      responseSchema: ownershipEvidenceResponseSchema,
      handle: ({ url }) => runtime.readOwnershipEvidence(parseOwnershipEvidenceRequest(url))
    },
    {
      operationId: "setOwnerCandidateStatus",
      tags: ["Ownership"],
      summary: "Set owner candidate evidence status to active or inactive.",
      path: `${restBasePath}/ownership/ownerCandidates/status`,
      querySchema: ownerCandidateStatusQuerySchema,
      responseSchema: ownerCandidateStatusResponseSchema,
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
  const azureRbac = readOptionalBooleanSearchParam(url, "azureRbac");
  const kind = readRequiredSearchParam(url, "kind");

  if (kind === "servicePrincipal" || kind === "managedIdentity") {
    return {
      kind,
      ...(azureRbac === undefined ? {} : { azureRbac }),
      principalId: readRequiredSearchParam(url, "principalId")
    };
  }

  if (kind === "resourceGroup") {
    const { page, pageSize } = parseRuntimeCollectionQueryOptions(url);

    return {
      kind,
      ...(azureRbac === undefined ? {} : { azureRbac }),
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

function readOptionalBooleanSearchParam(url: URL, name: string): boolean | undefined {
  const value = url.searchParams.get(name)?.trim().toLowerCase();
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new RuntimeHttpError(`Invalid boolean query parameter: ${name}`, 400);
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
