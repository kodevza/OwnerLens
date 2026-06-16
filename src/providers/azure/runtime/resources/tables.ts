import type { DuckDBConnection } from "@duckdb/node-api";

import type {
  AzureActivityLog as CoreAzureActivityLog,
  AzureResource as CoreAzureResource,
  AzureResourceGroup as CoreAzureResourceGroup,
  AzureRoleAssignment as CoreAzureRoleAssignment,
  AzureSubscription as CoreAzureSubscription,
  AzureUserAssignedManagedIdentity as CoreAzureUserAssignedManagedIdentity
} from "../../../../core/azure/resources";
import type {
  AzureActivityLog as AzureActivityLogInput,
  AzureResource as AzureResourceInput,
  AzureResourceGroup as AzureResourceGroupInput,
  AzureRoleAssignment as AzureRoleAssignmentInput,
  AzureSubscription as AzureSubscriptionInput,
  AzureUserAssignedManagedIdentity as AzureUserAssignedManagedIdentityInput
} from "../../inputTransferObject/generated/AzureSnapshot";

export async function insertAzureSubscriptionRows(
  connection: DuckDBConnection,
  subscriptions: AzureSubscriptionInput[]
): Promise<void> {
  for (const [ordinal, row] of subscriptions.entries()) {
    await connection.run("insert into azure_subscriptions values ($ordinal, $subscriptionId, $subscriptionName, $tenantId, $state, $tags::json)", {
      ordinal,
      subscriptionId: row.subscriptionId,
      subscriptionName: row.subscriptionName,
      tenantId: row.tenantId,
      state: row.state,
      tags: JSON.stringify(row.tags ?? null)
    });
  }
}

export async function insertAzureResourceGroupRows(
  connection: DuckDBConnection,
  resourceGroups: AzureResourceGroupInput[]
): Promise<void> {
  for (const [ordinal, row] of resourceGroups.entries()) {
    await connection.run(
      "insert into azure_resource_groups values ($ordinal, $subscriptionId, $subscriptionName, $resourceGroup, $location, $tags::json)",
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceGroup: row.resourceGroup,
        location: row.location,
        tags: JSON.stringify(row.tags ?? null)
      }
    );
  }
}

export async function insertAzureResourceRows(connection: DuckDBConnection, resources: AzureResourceInput[]): Promise<void> {
  for (const [ordinal, row] of resources.entries()) {
    await connection.run(
      `insert into azure_resources values (
        $ordinal, $subscriptionId, $subscriptionName, $resourceId, $resourceName, $resourceGroup, $resourceType,
        $kind, $location, $tags::json, $identityType, $identityPrincipalId, $identityTenantId,
        $userAssignedIdentityResourceIds::json, $userAssignedIdentities::json
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceId: row.resourceId,
        resourceName: row.resourceName,
        resourceGroup: row.resourceGroup,
        resourceType: row.resourceType,
        kind: row.kind,
        location: row.location,
        tags: JSON.stringify(row.tags ?? null),
        identityType: row.identityType,
        identityPrincipalId: row.identityPrincipalId,
        identityTenantId: row.identityTenantId,
        userAssignedIdentityResourceIds: JSON.stringify(row.userAssignedIdentityResourceIds ?? []),
        userAssignedIdentities: JSON.stringify(row.userAssignedIdentities ?? null)
      }
    );
  }
}

export async function insertAzureUserAssignedManagedIdentityRows(
  connection: DuckDBConnection,
  identities: AzureUserAssignedManagedIdentityInput[]
): Promise<void> {
  for (const [ordinal, row] of identities.entries()) {
    await connection.run(
      `insert into azure_user_assigned_managed_identities values (
        $ordinal, $subscriptionId, $subscriptionName, $resourceId, $name, $resourceGroup, $location,
        $clientId, $principalId, $tenantId, $tags::json
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceId: row.resourceId,
        name: row.name,
        resourceGroup: row.resourceGroup,
        location: row.location,
        clientId: row.clientId,
        principalId: row.principalId,
        tenantId: row.tenantId,
        tags: JSON.stringify(row.tags ?? null)
      }
    );
  }
}

export async function insertAzureRoleAssignmentRows(
  connection: DuckDBConnection,
  assignments: AzureRoleAssignmentInput[]
): Promise<void> {
  for (const [ordinal, row] of assignments.entries()) {
    await connection.run(
      `insert into azure_role_assignments values (
        $ordinal, $subscriptionId, $subscriptionName, $roleAssignmentId, $scope, $scopeType, $scopeSubscriptionId,
        $scopeResourceGroup, $scopeResourceProvider, $scopeResourceType, $scopeResourceName, $scopeManagementGroup,
        $principalId, $principalType, $principalDisplayName, $signInName, $roleDefinitionId, $roleDefinitionName,
        $canDelegate, $condition, $conditionVersion
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        roleAssignmentId: row.roleAssignmentId,
        scope: row.scope,
        scopeType: row.scopeType ?? null,
        scopeSubscriptionId: row.scopeSubscriptionId ?? null,
        scopeResourceGroup: row.scopeResourceGroup ?? null,
        scopeResourceProvider: row.scopeResourceProvider ?? null,
        scopeResourceType: row.scopeResourceType ?? null,
        scopeResourceName: row.scopeResourceName ?? null,
        scopeManagementGroup: row.scopeManagementGroup ?? null,
        principalId: row.principalId,
        principalType: row.principalType,
        principalDisplayName: row.principalDisplayName,
        signInName: row.signInName,
        roleDefinitionId: row.roleDefinitionId,
        roleDefinitionName: row.roleDefinitionName,
        canDelegate: row.canDelegate,
        condition: row.condition,
        conditionVersion: row.conditionVersion
      }
    );
  }
}

export async function insertAzureActivityLogRows(connection: DuckDBConnection, logs: AzureActivityLogInput[]): Promise<void> {
  for (const [ordinal, row] of logs.entries()) {
    await connection.run(
      `insert into azure_activity_logs values (
        $ordinal, $subscriptionId, $subscriptionName, $eventTimestamp, $submissionTimestamp, $caller,
        $callerUserPrincipalName, $callerName, $callerEmail, $callerObjectId, $callerIdentityType, $callerAppId,
        $callerIpAddress, $callerTenantId, $operationName, $operationNameValue, $status, $subStatus, $category,
        $resourceGroupName, $resourceId, $resourceProviderName, $resourceType, $authorizationAction, $authorizationScope
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        eventTimestamp: row.eventTimestamp,
        submissionTimestamp: row.submissionTimestamp,
        caller: row.caller,
        callerUserPrincipalName: row.callerUserPrincipalName ?? null,
        callerName: row.callerName ?? null,
        callerEmail: row.callerEmail ?? null,
        callerObjectId: row.callerObjectId ?? null,
        callerIdentityType: row.callerIdentityType ?? null,
        callerAppId: row.callerAppId ?? null,
        callerIpAddress: row.callerIpAddress ?? null,
        callerTenantId: row.callerTenantId ?? null,
        operationName: row.operationName,
        operationNameValue: row.operationNameValue,
        status: row.status,
        subStatus: row.subStatus,
        category: row.category,
        resourceGroupName: row.resourceGroupName,
        resourceId: row.resourceId,
        resourceProviderName: row.resourceProviderName,
        resourceType: row.resourceType,
        authorizationAction: row.authorizationAction,
        authorizationScope: row.authorizationScope
      }
    );
  }
}

export async function readAzureSubscriptionRows(connection: DuckDBConnection): Promise<CoreAzureSubscription[]> {
  return (await readRows<AzureSubscriptionRow>(
    connection,
    "select subscription_id, subscription_name, tenant_id, state, tags from azure_subscriptions order by ordinal"
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    tenantId: row.tenant_id,
    state: row.state,
    tags: parseJsonObject(row.tags)
  }));
}

export async function readAzureResourceGroupRows(connection: DuckDBConnection): Promise<CoreAzureResourceGroup[]> {
  return (await readRows<AzureResourceGroupRow>(
    connection,
    "select subscription_id, subscription_name, resource_group, location, tags from azure_resource_groups order by ordinal"
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    resourceGroup: row.resource_group,
    location: row.location,
    tags: parseJsonObject(row.tags)
  }));
}

export async function readAzureResourceRows(connection: DuckDBConnection): Promise<CoreAzureResource[]> {
  return (await readRows<AzureResourceRow>(
    connection,
    `select subscription_id, subscription_name, resource_id, resource_name, resource_group, resource_type, kind, location,
      tags, identity_type, identity_principal_id, identity_tenant_id, user_assigned_identity_resource_ids, user_assigned_identities
    from azure_resources order by ordinal`
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    resourceGroup: row.resource_group,
    resourceType: row.resource_type,
    kind: row.kind,
    location: row.location,
    tags: parseJsonObject(row.tags),
    identityType: row.identity_type,
    identityPrincipalId: row.identity_principal_id,
    identityTenantId: row.identity_tenant_id,
    userAssignedIdentityResourceIds: parseJsonArray<string>(row.user_assigned_identity_resource_ids),
    userAssignedIdentities: parseJsonValue(row.user_assigned_identities)
  }));
}

export async function readAzureUserAssignedManagedIdentityRows(
  connection: DuckDBConnection
): Promise<CoreAzureUserAssignedManagedIdentity[]> {
  return (await readRows<AzureUserAssignedManagedIdentityRow>(
    connection,
    `select subscription_id, subscription_name, resource_id, name, resource_group, location, client_id, principal_id, tenant_id, tags
    from azure_user_assigned_managed_identities order by ordinal`
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    resourceId: row.resource_id,
    name: row.name,
    resourceGroup: row.resource_group,
    location: row.location,
    clientId: row.client_id,
    principalId: row.principal_id,
    tenantId: row.tenant_id,
    tags: parseJsonObject(row.tags)
  }));
}

export async function readAzureRoleAssignmentRows(connection: DuckDBConnection): Promise<CoreAzureRoleAssignment[]> {
  return (await readRows<AzureRoleAssignmentRow>(
    connection,
    `select subscription_id, subscription_name, role_assignment_id, scope, scope_type, scope_subscription_id,
      scope_resource_group, scope_resource_provider, scope_resource_type, scope_resource_name, scope_management_group,
      principal_id, principal_type, principal_display_name, sign_in_name, role_definition_id, role_definition_name,
      can_delegate, condition, condition_version
    from azure_role_assignments order by ordinal`
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    roleAssignmentId: row.role_assignment_id,
    scope: row.scope,
    scopeType: row.scope_type,
    scopeSubscriptionId: row.scope_subscription_id,
    scopeResourceGroup: row.scope_resource_group,
    scopeResourceProvider: row.scope_resource_provider,
    scopeResourceType: row.scope_resource_type,
    scopeResourceName: row.scope_resource_name,
    scopeManagementGroup: row.scope_management_group,
    principalId: row.principal_id,
    principalType: row.principal_type,
    principalDisplayName: row.principal_display_name,
    signInName: row.sign_in_name,
    roleDefinitionId: row.role_definition_id,
    roleDefinitionName: row.role_definition_name,
    canDelegate: row.can_delegate,
    condition: row.condition,
    conditionVersion: row.condition_version
  }));
}

export async function readAzureActivityLogRows(connection: DuckDBConnection): Promise<CoreAzureActivityLog[]> {
  return (await readRows<AzureActivityLogRow>(
    connection,
    `select subscription_id, subscription_name, event_timestamp, submission_timestamp, caller, caller_user_principal_name,
      caller_name, caller_email, caller_object_id, caller_identity_type, caller_app_id, caller_ip_address, caller_tenant_id,
      operation_name, operation_name_value, status, sub_status, category, resource_group_name, resource_id,
      resource_provider_name, resource_type, authorization_action, authorization_scope
    from azure_activity_logs order by ordinal`
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    eventTimestamp: row.event_timestamp,
    submissionTimestamp: row.submission_timestamp,
    caller: row.caller,
    callerUserPrincipalName: row.caller_user_principal_name,
    callerName: row.caller_name,
    callerEmail: row.caller_email,
    callerObjectId: row.caller_object_id,
    callerIdentityType: row.caller_identity_type,
    callerAppId: row.caller_app_id,
    callerIpAddress: row.caller_ip_address,
    callerTenantId: row.caller_tenant_id,
    operationName: row.operation_name,
    operationNameValue: row.operation_name_value,
    status: row.status,
    subStatus: row.sub_status,
    category: row.category,
    resourceGroupName: row.resource_group_name,
    resourceId: row.resource_id,
    resourceProviderName: row.resource_provider_name,
    resourceType: row.resource_type,
    authorizationAction: row.authorization_action,
    authorizationScope: row.authorization_scope
  }));
}

type AzureSubscriptionRow = {
  subscription_id: string;
  subscription_name: string;
  tenant_id: string;
  state: CoreAzureSubscription["state"];
  tags: string | null;
};

type AzureResourceGroupRow = {
  subscription_id: string;
  subscription_name: string;
  resource_group: string;
  location: string;
  tags: string | null;
};

type AzureResourceRow = {
  subscription_id: string;
  subscription_name: string;
  resource_id: string;
  resource_name: string;
  resource_group: string;
  resource_type: string;
  kind: string | null;
  location: string;
  tags: string | null;
  identity_type: string | null;
  identity_principal_id: string | null;
  identity_tenant_id: string | null;
  user_assigned_identity_resource_ids: string;
  user_assigned_identities: string | null;
};

type AzureUserAssignedManagedIdentityRow = {
  subscription_id: string;
  subscription_name: string;
  resource_id: string;
  name: string;
  resource_group: string;
  location: string;
  client_id: string;
  principal_id: string;
  tenant_id: string;
  tags: string | null;
};

type AzureRoleAssignmentRow = {
  subscription_id: string;
  subscription_name: string;
  role_assignment_id: string | null;
  scope: string;
  scope_type: CoreAzureRoleAssignment["scopeType"];
  scope_subscription_id: string | null;
  scope_resource_group: string | null;
  scope_resource_provider: string | null;
  scope_resource_type: string | null;
  scope_resource_name: string | null;
  scope_management_group: string | null;
  principal_id: string;
  principal_type: string | null;
  principal_display_name: string | null;
  sign_in_name: string | null;
  role_definition_id: string | null;
  role_definition_name: string | null;
  can_delegate: boolean | null;
  condition: string | null;
  condition_version: string | null;
};

type AzureActivityLogRow = {
  subscription_id: string;
  subscription_name: string;
  event_timestamp: string;
  submission_timestamp: string | null;
  caller: string | null;
  caller_user_principal_name: string | null;
  caller_name: string | null;
  caller_email: string | null;
  caller_object_id: string | null;
  caller_identity_type: string | null;
  caller_app_id: string | null;
  caller_ip_address: string | null;
  caller_tenant_id: string | null;
  operation_name: string | null;
  operation_name_value: string | null;
  status: string | null;
  sub_status: string | null;
  category: string | null;
  resource_group_name: string | null;
  resource_id: string | null;
  resource_provider_name: string | null;
  resource_type: string | null;
  authorization_action: string | null;
  authorization_scope: string | null;
};

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

function parseJsonObject<T extends Record<string, string>>(value: string | null | undefined): T | null {
  return value ? JSON.parse(value) : null;
}

function parseJsonValue(value: string | null | undefined): unknown {
  return value ? JSON.parse(value) : null;
}
