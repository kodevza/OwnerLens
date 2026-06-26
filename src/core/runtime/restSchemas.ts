import type { RuntimeRestJsonSchema } from "./restValidation";

const queryStringSchema: RuntimeRestJsonSchema = { type: "string" };

const queryStringOrStringArraySchema: RuntimeRestJsonSchema = {
  anyOf: [
    { type: "string" },
    { type: "array", items: { type: "string" } }
  ]
};

export const jsonValueSchema: RuntimeRestJsonSchema = {
  anyOf: [
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
    { type: "array", items: { $ref: "#/$defs/jsonValue" } },
    {
      type: "object",
      additionalProperties: { $ref: "#/$defs/jsonValue" }
    }
  ],
  $defs: {
    jsonValue: {
      anyOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
        { type: "array", items: { $ref: "#/$defs/jsonValue" } },
        {
          type: "object",
          additionalProperties: { $ref: "#/$defs/jsonValue" }
        }
      ]
    }
  }
};

export const emptyQuerySchema = querySchema({});

export const appConfigResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["features", "azure"],
  additionalProperties: false,
  properties: {
    features: {
      type: "object",
      required: ["zeroTrustAssessment"],
      additionalProperties: false,
      properties: {
        zeroTrustAssessment: { type: "boolean" }
      }
    },
    azure: {
      type: "object",
      required: ["ownership"],
      additionalProperties: false,
      properties: {
        ownership: {
          type: "object",
          required: ["ownerTags"],
          additionalProperties: false,
          properties: {
            ownerTags: {
              type: "array",
              items: {
                type: "object",
                required: ["name", "confidence", "type"],
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  confidence: { enum: ["high", "medium", "low"] },
                  type: { enum: ["ownerUser", "ownerGroup", "ownerTag", "application", "unknown"] }
                }
              }
            }
          }
        }
      }
    }
  }
};

export const collectionQuerySchema = querySchema(
  {
    page: queryStringSchema,
    pageSize: queryStringSchema,
    count: queryStringSchema,
    format: {
      enum: ["csv"]
    },
    selectedRowKey: queryStringOrStringArraySchema
  },
  {
    "^filter\\[\\d+\\]\\[(column|value|values)\\](\\[\\d+\\])?$": queryStringSchema,
    "^sort\\[\\d+\\]\\[(column|direction)\\]$": queryStringSchema
  }
);

export const powershellScriptQuerySchema = querySchema(
  {
    collection: {
      enum: ["azureResources.resourceGroupOwnership", "entra.servicePrincipals", "entra.managedIdentities"]
    },
    template: {
      enum: ["setResourceGroupOwnerTag", "setResourceGroupOwnerGroupTag", "setServicePrincipalOwnerTag"]
    },
    page: queryStringSchema,
    pageSize: queryStringSchema,
    count: queryStringSchema,
    selectedRowKey: queryStringOrStringArraySchema
  },
  {
    "^filter\\[\\d+\\]\\[(column|value|values)\\](\\[\\d+\\])?$": queryStringSchema,
    "^sort\\[\\d+\\]\\[(column|direction)\\]$": queryStringSchema
  },
  ["template"]
);

export const csvCollectionQuerySchema = querySchema(
  {
    id: queryStringSchema,
    page: queryStringSchema,
    pageSize: queryStringSchema,
    count: queryStringSchema,
    format: {
      const: "csv"
    },
    selectedRowKey: queryStringOrStringArraySchema
  },
  {
    "^filter\\[\\d+\\]\\[(column|value|values)\\](\\[\\d+\\])?$": queryStringSchema,
    "^sort\\[\\d+\\]\\[(column|direction)\\]$": queryStringSchema
  },
  ["id", "format"]
);

export const collectionResponseSchema = (collectionId: string, rowSchema: RuntimeRestJsonSchema): RuntimeRestJsonSchema => ({
  type: "object",
  required: ["collectionId", "columns", "rows", "page", "pageSize", "count"],
  additionalProperties: false,
  properties: {
    collectionId: { const: collectionId },
    columns: { type: "array", items: { type: "string" } },
    rows: { type: "array", items: rowSchema },
    page: { type: "integer" },
    pageSize: { type: "integer" },
    count: { type: "integer" }
  }
});

export const runtimeRowSchema: RuntimeRestJsonSchema = {
  type: "object",
  additionalProperties: true
};

export const powershellScriptResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["kind", "templateId", "fileName", "contentType", "body", "count", "targetIds"],
  additionalProperties: false,
  properties: {
    kind: { const: "powershellScript" },
    templateId: { enum: ["setResourceGroupOwnerTag", "setResourceGroupOwnerGroupTag", "setServicePrincipalOwnerTag"] },
    fileName: { type: "string" },
    contentType: { const: "text/x-powershell; charset=utf-8" },
    body: { type: "string" },
    count: { type: "integer" },
    targetIds: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const runtimeErrorResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["error"],
  additionalProperties: false,
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      additionalProperties: false,
      properties: {
        code: { type: "string" },
        message: { type: "string" }
      }
    }
  }
};

export const snapshotListResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["files"],
  additionalProperties: false,
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "size", "updatedAt"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          size: { type: "number" },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    },
    error: { type: "string" }
  }
};

export const principalIdQuerySchema = querySchema({ principalId: queryStringSchema }, {}, ["principalId"]);

export const userGroupsQuerySchema = querySchema({ user: queryStringSchema }, {}, ["user"]);

export const azureRbacQuerySchema = querySchema({
  servicePrincipalId: queryStringSchema,
  subscriptionId: queryStringSchema,
  resourceGroup: queryStringSchema,
  page: queryStringSchema,
  pageSize: queryStringSchema,
  count: queryStringSchema,
  selectedRowKey: queryStringOrStringArraySchema
}, {
  "^filter\\[\\d+\\]\\[(column|value|values)\\](\\[\\d+\\])?$": queryStringSchema,
  "^sort\\[\\d+\\]\\[(column|direction)\\]$": queryStringSchema
});

export const ownershipEvidenceQuerySchema = querySchema({
  azureRbac: { enum: ["true", "false"] },
  kind: { enum: ["servicePrincipal", "managedIdentity", "resourceGroup"] },
  principalId: queryStringSchema,
  subscriptionId: queryStringSchema,
  resourceGroup: queryStringSchema,
  page: queryStringSchema,
  pageSize: queryStringSchema,
  count: queryStringSchema
}, {}, ["kind"]);

export const ownerCandidateStatusQuerySchema = querySchema(
  {
    key: queryStringSchema,
    status: { enum: ["active", "inactive", "unactive"] }
  },
  {},
  ["key", "status"]
);

export const remediationPackageQuerySchema = querySchema({ id: queryStringSchema }, {}, ["id"]);

export const remediationPackageResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["id", "createdAt", "sourceKind", "sourceLabel", "sourceQuery", "taskCount", "tasks"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    sourceKind: { type: "string" },
    sourceLabel: { type: "string" },
    sourceQuery: jsonValueSchema,
    taskCount: { type: "integer" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "packageId", "createdAt", "status", "targetKind", "targetId", "targetLabel", "title", "risk", "sourceEvidence"],
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          packageId: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          status: { const: "open" },
          targetKind: { type: "string" },
          targetId: { type: "string" },
          targetLabel: { type: "string" },
          title: { type: "string" },
          risk: { type: ["string", "null"] },
          sourceEvidence: jsonValueSchema
        }
      }
    }
  }
};

export const deleteRemediationTasksBodySchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["packageId", "taskIds"],
  additionalProperties: false,
  properties: {
    packageId: { type: "string" },
    taskIds: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const createRemediationPackageBodySchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["filters", "selectedRowKeys"],
  additionalProperties: false,
  properties: {
    filters: {
      type: "object",
      additionalProperties: {
        anyOf: [
          {
            type: "object",
            required: ["type", "value"],
            additionalProperties: false,
            properties: {
              type: { const: "text" },
              value: { type: "string" }
            }
          },
          {
            type: "object",
            required: ["type", "values"],
            additionalProperties: false,
            properties: {
              type: { const: "values" },
              values: { type: "array", items: { type: "string" } }
            }
          },
          {
            type: "object",
            required: ["type", "conditions"],
            additionalProperties: false,
            properties: {
              type: { const: "objectFields" },
              conditions: {
                type: "array",
                items: {
                  type: "object",
                  required: ["fieldId", "value"],
                  additionalProperties: false,
                  properties: {
                    fieldId: { type: "string" },
                    value: { type: "string" }
                  }
                }
              }
            }
          }
        ]
      }
    },
    selectAllMatchingFilters: { type: "boolean" },
    selectedRowKeys: {
      type: "array",
      items: { type: "string" }
    }
  }
};

export const createRemediationPackageResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: { type: "string" }
  }
};

export const runtimeInventoryStatsResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["users", "groups", "servicePrincipals", "managedIdentities", "resourceGroups", "rbacAssignments"],
  additionalProperties: false,
  properties: {
    users: { type: "integer" },
    groups: { type: "integer" },
    servicePrincipals: { type: "integer" },
    managedIdentities: { type: "integer" },
    resourceGroups: { type: "integer" },
    rbacAssignments: { type: "integer" }
  }
};

export const ownerCandidateStatusResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["key", "status", "disabled", "disabledCount"],
  additionalProperties: false,
  properties: {
    key: { type: "string" },
    status: { enum: ["active", "inactive"] },
    disabled: { type: "boolean" },
    disabledCount: { type: "integer" }
  }
};

export const entraPermissionsResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  additionalProperties: true
};

export const entraUserGroupsResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  required: ["user", "groups"],
  additionalProperties: false,
  properties: {
    user: { type: "string" },
    groups: {
      type: "array",
      items: {
        type: "object",
        required: ["groupId", "groupDisplayName"],
        additionalProperties: false,
        properties: {
          groupId: { type: "string" },
          groupDisplayName: { type: ["string", "null"] }
        }
      }
    }
  }
};

export const ownershipEvidenceResponseSchema: RuntimeRestJsonSchema = {
  type: "object",
  additionalProperties: true,
  required: ["target", "evidence"],
  properties: {
    target: {
      type: "object",
      additionalProperties: true
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true
      }
    },
    page: { type: "integer" },
    pageSize: { type: "integer" },
    count: { type: "integer" }
  }
};

function querySchema(
  properties: Record<string, RuntimeRestJsonSchema>,
  patternProperties: Record<string, RuntimeRestJsonSchema> = {},
  required: string[] = []
): RuntimeRestJsonSchema {
  return {
    type: "object",
    required,
    additionalProperties: true,
    properties,
    patternProperties
  };
}
