import { randomUUID } from "node:crypto";

import type { DuckDBConnection } from "@duckdb/node-api";

import {
  AZURE_ACCESS_RISK_RANK,
  type AzureIdentityEnrichmentStatus,
  type AzureManagedIdentityAssignmentEnrichment,
  type AzureRoleAssignmentEnrichment,
  type LatestAzureIdentityEnrichment,
  type ManagedIdentityPermissionRiskAssignment,
  type ManagedIdentityPermissionRiskLevel,
  type ManagedIdentityPermissionRiskSummary
} from "../../../../core/azure/identityEnrichment";
import type { AzureResource, AzureRoleAssignment } from "../../../../core/azure/resources";
import { isBroadAzureScope } from "./azureScopeClassifier";
import { evaluateAzureRoleAssignmentRisk } from "./evaluateAzureRoleAssignmentRisk";
import { getResourceManagedIdentityAssignments } from "../entra/buildAzureManagedIdentityAssignmentIndex";
import type { AzureManagedIdentityResourceAssignment } from "../entra/azureIdentityTypes";
import type { EntraServicePrincipal, InputEntraGroupMember } from "../../inputTransferObject/generated/EntraSnapshot";
import { readEntraGroupMemberRows } from "../entra/groupMembersTable";
import { readEntraServicePrincipalRows } from "../entra/servicePrincipalsTable";
import { readAzureResourceRows, readAzureRoleAssignmentRows } from "../resources/tables";

export type {
  AzureIdentityEnrichmentStatus,
  LatestAzureIdentityEnrichment
} from "../../../../core/azure/identityEnrichment";

const emptyStatus: AzureIdentityEnrichmentStatus = {
  calculated: false,
  latestRunId: null,
  identityRoleAssignmentCount: 0,
  accessRiskIdentityCount: 0,
  managedIdentityAssignmentCount: 0,
  calculatedAt: null
};

export async function recalculateAzureIdentityEnrichment(
  connection: DuckDBConnection
): Promise<AzureIdentityEnrichmentStatus> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  await connection.run(
    `insert into azure_runtime_enrichment_runs values (
      $runId, $startedAt, null, 'running', 0, 0, 0, null
    )`,
    { runId, startedAt }
  );

  try {
    const servicePrincipals = await readEntraServicePrincipalRows(connection);
    const roleAssignments = await readOptionalRows(connection, readAzureRoleAssignmentRows);
    const groupMembers = await readOptionalRows(connection, readEntraGroupMemberRows);
    const resources = await readOptionalRows(connection, readAzureResourceRows);
    const effectiveRoleAssignments = buildEffectiveRoleAssignmentsByPrincipalId(
      servicePrincipals,
      roleAssignments,
      groupMembers
    );
    const roleEnrichment = buildRoleAssignmentEnrichment(effectiveRoleAssignments);
    const accessRiskEnrichment = buildAccessRiskEnrichment(servicePrincipals, effectiveRoleAssignments);
    const managedIdentityEnrichment = buildManagedIdentityAssignmentEnrichment(servicePrincipals, resources);
    const completedAt = new Date().toISOString();

    await connection.run("begin transaction");
    try {
      await insertRoleAssignmentEnrichmentRows(connection, runId, roleEnrichment);
      await insertAccessRiskEnrichmentRows(connection, runId, accessRiskEnrichment);
      await insertManagedIdentityAssignmentEnrichmentRows(connection, runId, managedIdentityEnrichment);
      await connection.run(
        `update azure_runtime_enrichment_runs
        set completed_at = $completedAt,
            status = 'completed',
            identity_role_assignment_count = $identityRoleAssignmentCount,
            access_risk_identity_count = $accessRiskIdentityCount,
            managed_identity_assignment_count = $managedIdentityAssignmentCount
        where run_id = $runId`,
        {
          runId,
          completedAt,
          identityRoleAssignmentCount: sumRoleAssignments(roleEnrichment),
          accessRiskIdentityCount: accessRiskEnrichment.length,
          managedIdentityAssignmentCount: sumManagedIdentityAssignments(managedIdentityEnrichment)
        }
      );
      await connection.run("commit");
    } catch (error) {
      await connection.run("rollback");
      throw error;
    }

    return {
      calculated: true,
      latestRunId: runId,
      identityRoleAssignmentCount: sumRoleAssignments(roleEnrichment),
      accessRiskIdentityCount: accessRiskEnrichment.length,
      managedIdentityAssignmentCount: sumManagedIdentityAssignments(managedIdentityEnrichment),
      calculatedAt: completedAt
    };
  } catch (error) {
    await connection.run(
      `update azure_runtime_enrichment_runs
      set completed_at = $completedAt, status = 'failed', error_message = $errorMessage
      where run_id = $runId`,
      {
        runId,
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    );
    throw error;
  }
}

export async function readAzureIdentityEnrichmentStatus(
  connection: DuckDBConnection
): Promise<AzureIdentityEnrichmentStatus> {
  const rows = await readRows<AzureRuntimeEnrichmentRunRow>(
    connection,
    `select run_id, completed_at, identity_role_assignment_count, access_risk_identity_count,
      managed_identity_assignment_count
    from azure_runtime_enrichment_runs
    where status = 'completed'
    order by completed_at desc
    limit 1`
  );
  const row = rows[0];

  return row
    ? {
        calculated: true,
        latestRunId: row.run_id,
        identityRoleAssignmentCount: row.identity_role_assignment_count,
        accessRiskIdentityCount: row.access_risk_identity_count,
        managedIdentityAssignmentCount: row.managed_identity_assignment_count,
        calculatedAt: row.completed_at
      }
    : emptyStatus;
}

export async function readLatestAzureIdentityEnrichment(
  connection: DuckDBConnection,
  principalIds?: string[]
): Promise<LatestAzureIdentityEnrichment> {
  const status = await readAzureIdentityEnrichmentStatus(connection);
  if (!status.latestRunId) {
    return {
      status,
      roleAssignmentsByPrincipalId: new Map(),
      accessRiskByPrincipalId: new Map(),
      managedIdentityAssignmentsByServicePrincipalId: new Map()
    };
  }

  const normalizedPrincipalIds = principalIds ? normalizeKeys(principalIds) : null;
  if (normalizedPrincipalIds?.length === 0) {
    return {
      status,
      roleAssignmentsByPrincipalId: new Map(),
      accessRiskByPrincipalId: new Map(),
      managedIdentityAssignmentsByServicePrincipalId: new Map()
    };
  }
  const principalIdFilter = normalizedPrincipalIds ? toSqlStringList(normalizedPrincipalIds) : null;
  const identityAssignmentFilter = normalizedPrincipalIds ? toSqlStringList(normalizedPrincipalIds) : null;

  const roleRows = await readRows<AzureIdentityRoleAssignmentEnrichmentRow>(
    connection,
    `select principal_id, assignment_count, role_assignments
    from azure_identity_role_assignment_enrichment
    where run_id = '${status.latestRunId}'
    ${principalIdFilter ? `and lower(principal_id) in (${principalIdFilter})` : ""}`
  );
  const riskRows = await readRows<AzureIdentityAccessRiskEnrichmentRow>(
    connection,
    `select principal_id, risk_level, assignment_count, high_risk_assignment_count,
      broad_scope_assignment_count, role_assignments
    from azure_identity_access_risk_enrichment
    where run_id = '${status.latestRunId}'
    ${principalIdFilter ? `and lower(principal_id) in (${principalIdFilter})` : ""}`
  );
  const managedIdentityRows = await readRows<AzureManagedIdentityAssignmentEnrichmentRow>(
    connection,
    `select service_principal_id, principal_id, client_id, assignment_count, assigned_resource_groups,
      managed_identity_assignments
    from azure_managed_identity_assignment_enrichment
    where run_id = '${status.latestRunId}'
    ${identityAssignmentFilter ? `and (
      lower(service_principal_id) in (${identityAssignmentFilter})
      or lower(principal_id) in (${identityAssignmentFilter})
      or lower(client_id) in (${identityAssignmentFilter})
    )` : ""}`
  );

  return {
    status,
    roleAssignmentsByPrincipalId: new Map(
      roleRows.map((row) => [
        normalizeKey(row.principal_id),
        {
          principalId: row.principal_id,
          assignmentCount: row.assignment_count,
          roleAssignments: parseJsonArray<AzureRoleAssignment>(row.role_assignments)
        }
      ])
    ),
    accessRiskByPrincipalId: new Map(
      riskRows.map((row) => [
        normalizeKey(row.principal_id),
        {
          principalId: row.principal_id,
          riskLevel: row.risk_level,
          assignmentCount: row.assignment_count,
          highRiskAssignmentCount: row.high_risk_assignment_count,
          broadScopeAssignmentCount: row.broad_scope_assignment_count,
          roleAssignments: parseJsonArray<ManagedIdentityPermissionRiskAssignment>(row.role_assignments)
        }
      ])
    ),
    managedIdentityAssignmentsByServicePrincipalId: new Map(
      managedIdentityRows.map((row) => [
        normalizeKey(row.service_principal_id),
        {
          servicePrincipalId: row.service_principal_id,
          principalId: row.principal_id,
          clientId: row.client_id,
          assignmentCount: row.assignment_count,
          assignedResourceGroups: parseJsonArray<string>(row.assigned_resource_groups),
          managedIdentityAssignments: parseJsonArray<AzureManagedIdentityResourceAssignment>(
            row.managed_identity_assignments
          )
        }
      ])
    )
  };
}

function buildRoleAssignmentEnrichment(
  assignmentsByPrincipalId: Map<string, AzureRoleAssignment[]>
): AzureRoleAssignmentEnrichment[] {
  return [...assignmentsByPrincipalId.entries()]
    .map(([principalId, assignments]) => ({
      principalId,
      assignmentCount: assignments.length,
      roleAssignments: assignments.sort(compareRoleAssignments)
    }))
    .sort((left, right) => left.principalId.localeCompare(right.principalId));
}

function buildEffectiveRoleAssignmentsByPrincipalId(
  servicePrincipals: EntraServicePrincipal[],
  roleAssignments: AzureRoleAssignment[],
  groupMembers: InputEntraGroupMember[]
): Map<string, AzureRoleAssignment[]> {
  const identityIds = new Set(servicePrincipals.map((servicePrincipal) => normalizeKey(servicePrincipal.id)));
  const assignmentsByPrincipalId = new Map<string, AzureRoleAssignment[]>();
  const groupMembershipsByServicePrincipalId = buildGroupMembershipsByServicePrincipalId(identityIds, groupMembers);
  const assignmentsByGroupId = buildRoleAssignmentsByGroupId(roleAssignments);

  for (const assignment of roleAssignments) {
    const principalId = normalizeKey(assignment.principalId);
    if (!identityIds.has(principalId)) {
      continue;
    }

    const assignments = assignmentsByPrincipalId.get(principalId) ?? [];
    assignments.push({ ...assignment, assignmentSource: "direct" });
    assignmentsByPrincipalId.set(principalId, assignments);
  }

  for (const [servicePrincipalId, memberships] of groupMembershipsByServicePrincipalId.entries()) {
    const assignments = assignmentsByPrincipalId.get(servicePrincipalId) ?? [];

    for (const membership of memberships) {
      for (const assignment of assignmentsByGroupId.get(membership.groupId) ?? []) {
        assignments.push({
          ...assignment,
          assignmentSource: "group",
          inheritedFromGroupId: membership.groupId,
          inheritedFromGroupDisplayName: membership.groupDisplayName
        });
      }
    }

    if (assignments.length > 0) {
      assignmentsByPrincipalId.set(servicePrincipalId, assignments);
    }
  }

  return assignmentsByPrincipalId;
}

function buildAccessRiskEnrichment(
  servicePrincipals: EntraServicePrincipal[],
  roleAssignmentsByPrincipalId: Map<string, AzureRoleAssignment[]>
): ManagedIdentityPermissionRiskSummary[] {
  const summariesByPrincipalId = new Map<string, ManagedIdentityPermissionRiskSummary>();

  for (const servicePrincipal of servicePrincipals) {
    summariesByPrincipalId.set(normalizeKey(servicePrincipal.id), createRiskSummary(servicePrincipal.id));
  }

  for (const [principalId, roleAssignments] of roleAssignmentsByPrincipalId.entries()) {
    const summary = summariesByPrincipalId.get(principalId);
    if (!summary) {
      continue;
    }

    for (const assignment of roleAssignments) {
      const riskAssignment = evaluateAzureRoleAssignmentRisk(assignment);
      summary.roleAssignments.push(riskAssignment);
      summary.assignmentCount += 1;
      summary.riskLevel = maxRisk(summary.riskLevel, riskAssignment.riskLevel);

      if (riskAssignment.riskLevel === "high") {
        summary.highRiskAssignmentCount += 1;
      }
      if (isBroadAzureScope(assignment)) {
        summary.broadScopeAssignmentCount += 1;
      }
    }
  }

  for (const summary of summariesByPrincipalId.values()) {
    summary.roleAssignments.sort(compareRiskAssignments);
  }

  return [...summariesByPrincipalId.values()].sort((left, right) => left.principalId.localeCompare(right.principalId));
}

function buildManagedIdentityAssignmentEnrichment(
  servicePrincipals: EntraServicePrincipal[],
  resources: AzureResource[]
): AzureManagedIdentityAssignmentEnrichment[] {
  const assignmentsByKey = new Map<string, AzureManagedIdentityResourceAssignment[]>();

  for (const resource of resources) {
    for (const assignment of getResourceManagedIdentityAssignments(resource)) {
      addManagedIdentityAssignment(assignmentsByKey, assignment.clientId, assignment);
      addManagedIdentityAssignment(assignmentsByKey, assignment.principalId, assignment);
    }
  }

  return servicePrincipals
    .filter(isManagedIdentity)
    .map((servicePrincipal) => {
      const assignments = new Map<string, AzureManagedIdentityResourceAssignment>();
      for (const key of [servicePrincipal.id, servicePrincipal.appId]) {
        for (const assignment of assignmentsByKey.get(normalizeKey(key)) ?? []) {
          assignments.set(`${assignment.assignedResourceId}:${assignment.resourceId}`, assignment);
        }
      }

      const managedIdentityAssignments = [...assignments.values()].sort(compareManagedIdentityAssignments);
      return {
        servicePrincipalId: servicePrincipal.id,
        principalId: servicePrincipal.id,
        clientId: servicePrincipal.appId,
        assignmentCount: managedIdentityAssignments.length,
        assignedResourceGroups: uniqueSorted(managedIdentityAssignments.map((assignment) => assignment.assignedResourceGroup)),
        managedIdentityAssignments
      };
    })
    .sort((left, right) => left.servicePrincipalId.localeCompare(right.servicePrincipalId));
}

async function insertRoleAssignmentEnrichmentRows(
  connection: DuckDBConnection,
  runId: string,
  rows: AzureRoleAssignmentEnrichment[]
): Promise<void> {
  for (const row of rows) {
    await connection.run(
      `insert into azure_identity_role_assignment_enrichment values (
        $runId, $principalId, $assignmentCount, $roleAssignments::json
      )`,
      {
        runId,
        principalId: row.principalId,
        assignmentCount: row.assignmentCount,
        roleAssignments: JSON.stringify(row.roleAssignments)
      }
    );
  }
}

async function insertAccessRiskEnrichmentRows(
  connection: DuckDBConnection,
  runId: string,
  rows: ManagedIdentityPermissionRiskSummary[]
): Promise<void> {
  for (const row of rows) {
    await connection.run(
      `insert into azure_identity_access_risk_enrichment values (
        $runId, $principalId, $riskLevel, $assignmentCount, $highRiskAssignmentCount,
        $broadScopeAssignmentCount, $roleAssignments::json
      )`,
      {
        runId,
        principalId: row.principalId,
        riskLevel: row.riskLevel,
        assignmentCount: row.assignmentCount,
        highRiskAssignmentCount: row.highRiskAssignmentCount,
        broadScopeAssignmentCount: row.broadScopeAssignmentCount,
        roleAssignments: JSON.stringify(row.roleAssignments)
      }
    );
  }
}

async function insertManagedIdentityAssignmentEnrichmentRows(
  connection: DuckDBConnection,
  runId: string,
  rows: AzureManagedIdentityAssignmentEnrichment[]
): Promise<void> {
  for (const row of rows) {
    await connection.run(
      `insert into azure_managed_identity_assignment_enrichment values (
        $runId, $servicePrincipalId, $principalId, $clientId, $assignmentCount,
        $assignedResourceGroups::json, $managedIdentityAssignments::json
      )`,
      {
        runId,
        servicePrincipalId: row.servicePrincipalId,
        principalId: row.principalId,
        clientId: row.clientId,
        assignmentCount: row.assignmentCount,
        assignedResourceGroups: JSON.stringify(row.assignedResourceGroups),
        managedIdentityAssignments: JSON.stringify(row.managedIdentityAssignments)
      }
    );
  }
}

async function readOptionalRows<T>(
  connection: DuckDBConnection,
  read: (connection: DuckDBConnection) => Promise<T[]>
): Promise<T[]> {
  try {
    return await read(connection);
  } catch (error) {
    if (error instanceof Error && /does not exist|Catalog Error/i.test(error.message)) {
      return [];
    }
    throw error;
  }
}

function addManagedIdentityAssignment(
  assignmentsByKey: Map<string, AzureManagedIdentityResourceAssignment[]>,
  key: string | null,
  assignment: AzureManagedIdentityResourceAssignment
): void {
  if (!key) {
    return;
  }

  const normalizedKey = normalizeKey(key);
  const assignments = assignmentsByKey.get(normalizedKey) ?? [];
  assignments.push(assignment);
  assignmentsByKey.set(normalizedKey, assignments);
}

type ServicePrincipalGroupMembership = {
  groupId: string;
  groupDisplayName: string | null;
};

function buildGroupMembershipsByServicePrincipalId(
  servicePrincipalIds: Set<string>,
  groupMembers: InputEntraGroupMember[]
): Map<string, ServicePrincipalGroupMembership[]> {
  const membershipsByServicePrincipalId = new Map<string, ServicePrincipalGroupMembership[]>();

  for (const groupMember of groupMembers) {
    const memberId = normalizeKey(groupMember.memberId);
    if (!servicePrincipalIds.has(memberId)) {
      continue;
    }

    const memberType = groupMember.memberType?.toLowerCase();
    if (memberType !== "serviceprincipal" && memberType !== "unknown") {
      continue;
    }

    const memberships = membershipsByServicePrincipalId.get(memberId) ?? [];
    memberships.push({
      groupId: normalizeKey(groupMember.groupId),
      groupDisplayName: groupMember.groupDisplayName
    });
    membershipsByServicePrincipalId.set(memberId, memberships);
  }

  return membershipsByServicePrincipalId;
}

function buildRoleAssignmentsByGroupId(
  roleAssignments: AzureRoleAssignment[]
): Map<string, AzureRoleAssignment[]> {
  const assignmentsByGroupId = new Map<string, AzureRoleAssignment[]>();

  for (const assignment of roleAssignments) {
    if (assignment.principalType?.toLowerCase() !== "group") {
      continue;
    }

    const groupId = normalizeKey(assignment.principalId);
    const assignments = assignmentsByGroupId.get(groupId) ?? [];
    assignments.push(assignment);
    assignmentsByGroupId.set(groupId, assignments);
  }

  return assignmentsByGroupId;
}

function isManagedIdentity(servicePrincipal: EntraServicePrincipal): boolean {
  return servicePrincipal.servicePrincipalType === "ManagedIdentity";
}

function createRiskSummary(principalId: string): ManagedIdentityPermissionRiskSummary {
  return {
    principalId,
    riskLevel: "none",
    assignmentCount: 0,
    highRiskAssignmentCount: 0,
    broadScopeAssignmentCount: 0,
    roleAssignments: []
  };
}

function maxRisk(
  left: ManagedIdentityPermissionRiskLevel,
  right: ManagedIdentityPermissionRiskLevel
): ManagedIdentityPermissionRiskLevel {
  return AZURE_ACCESS_RISK_RANK[left] >= AZURE_ACCESS_RISK_RANK[right] ? left : right;
}

function compareRiskAssignments(
  left: ManagedIdentityPermissionRiskAssignment,
  right: ManagedIdentityPermissionRiskAssignment
): number {
  return (
    AZURE_ACCESS_RISK_RANK[right.riskLevel] - AZURE_ACCESS_RISK_RANK[left.riskLevel] ||
    left.subscriptionName.localeCompare(right.subscriptionName, undefined, { sensitivity: "base" }) ||
    (left.roleDefinitionName ?? "").localeCompare(right.roleDefinitionName ?? "", undefined, { sensitivity: "base" }) ||
    left.scope.localeCompare(right.scope, undefined, { sensitivity: "base" })
  );
}

function compareRoleAssignments(left: AzureRoleAssignment, right: AzureRoleAssignment): number {
  return (
    left.subscriptionName.localeCompare(right.subscriptionName, undefined, { sensitivity: "base" }) ||
    (left.roleDefinitionName ?? "").localeCompare(right.roleDefinitionName ?? "", undefined, { sensitivity: "base" }) ||
    left.scope.localeCompare(right.scope, undefined, { sensitivity: "base" })
  );
}

function compareManagedIdentityAssignments(
  left: AzureManagedIdentityResourceAssignment,
  right: AzureManagedIdentityResourceAssignment
): number {
  return (
    left.subscriptionName.localeCompare(right.subscriptionName, undefined, { sensitivity: "base" }) ||
    left.assignedResourceGroup.localeCompare(right.assignedResourceGroup, undefined, { sensitivity: "base" }) ||
    left.assignedResourceName.localeCompare(right.assignedResourceName, undefined, { sensitivity: "base" })
  );
}

function sumRoleAssignments(rows: AzureRoleAssignmentEnrichment[]): number {
  return rows.reduce((count, row) => count + row.assignmentCount, 0);
}

function sumManagedIdentityAssignments(rows: AzureManagedIdentityAssignmentEnrichment[]): number {
  return rows.reduce((count, row) => count + row.assignmentCount, 0);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function normalizeKey(value: string): string {
  return value.toLowerCase();
}

function normalizeKeys(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeKey(value.trim())).filter(Boolean))];
}

function toSqlStringList(values: string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as Row[];
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  return value ? JSON.parse(value) : [];
}

type AzureRuntimeEnrichmentRunRow = {
  run_id: string;
  completed_at: string;
  identity_role_assignment_count: number;
  access_risk_identity_count: number;
  managed_identity_assignment_count: number;
};

type AzureIdentityRoleAssignmentEnrichmentRow = {
  principal_id: string;
  assignment_count: number;
  role_assignments: string;
};

type AzureIdentityAccessRiskEnrichmentRow = {
  principal_id: string;
  risk_level: ManagedIdentityPermissionRiskLevel;
  assignment_count: number;
  high_risk_assignment_count: number;
  broad_scope_assignment_count: number;
  role_assignments: string;
};

type AzureManagedIdentityAssignmentEnrichmentRow = {
  service_principal_id: string;
  principal_id: string;
  client_id: string;
  assignment_count: number;
  assigned_resource_groups: string;
  managed_identity_assignments: string;
};
