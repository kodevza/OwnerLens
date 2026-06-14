export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type RemediationTaskStatus = "open";

export type RemediationTask = {
  id: string;
  packageId: string;
  createdAt: string;
  status: RemediationTaskStatus;
  targetKind: string;
  targetId: string;
  targetLabel: string;
  title: string;
  risk: string | null;
  sourceEvidence: JsonValue;
};

export type RemediationPackage = {
  id: string;
  createdAt: string;
  sourceKind: string;
  sourceLabel: string;
  sourceQuery: JsonValue;
  taskCount: number;
  tasks: RemediationTask[];
};

export type CreateRemediationPackageInput = {
  sourceKind: string;
  sourceLabel: string;
  sourceQuery: JsonValue;
  tasks: Omit<RemediationTask, "id" | "packageId" | "createdAt" | "status">[];
};

export type CreateRuntimeRemediationPackageRequest = {
  filters: Record<string, RuntimeRemediationPackageFilter>;
  selectedRowKeys: string[];
};

export type CreateRuntimeRemediationPackageResponse = {
  id: string;
};

export type DeleteRuntimeRemediationTasksRequest = {
  packageId: string;
  taskIds: string[];
};

export type RuntimeRemediationPackageFilter =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "values";
      values: string[];
    }
  | {
      type: "objectFields";
      conditions: Array<{ fieldId: string; value: string }>;
    };
