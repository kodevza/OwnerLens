import type { DuckDBConnection } from "@duckdb/node-api";

const entraSnapshotSchemaSql = [
  `
    create table if not exists entra_snapshot_meta (
      data json not null
    )
  `,
  `
    create table if not exists entra_snapshot_extra (
      data json not null
    )
  `
];

const entraServicePrincipalSchemaSql = [
  `
    create table if not exists entra_service_principals (
      ordinal integer not null,
      id varchar primary key,
      app_id varchar not null,
      display_name varchar not null,
      app_display_name varchar,
      service_principal_type varchar not null,
      publisher_name varchar,
      account_enabled boolean not null,
      app_owner_organization_id varchar,
      homepage varchar,
      login_url varchar,
      reply_urls json not null,
      service_principal_names json not null,
      tags json not null,
      app_roles json not null,
      owners json not null,
      app_owners json not null,
      service_principal_owners json not null,
      application_owners json not null,
      metadata json
    )
  `
];

const entraApplicationSchemaSql = [
  `
    create table if not exists entra_applications (
      ordinal integer not null,
      id varchar primary key,
      app_id varchar not null,
      display_name varchar not null,
      sign_in_audience varchar,
      publisher_domain varchar,
      identifier_uris json not null,
      tags json not null,
      app_roles json not null,
      oauth2_permission_scopes json not null,
      required_resource_access json not null,
      web json,
      spa json,
      public_client json,
      password_credentials json not null,
      key_credentials json not null,
      created_date_time varchar,
      deleted_date_time varchar,
      disabled_by_microsoft_status varchar,
      info json,
      notes varchar,
      owners json not null
    )
  `
];

const entraOAuth2PermissionGrantSchemaSql = [
  `
    create table if not exists entra_oauth2_permission_grants (
      ordinal integer not null,
      id varchar primary key,
      client_id varchar not null,
      consent_type varchar not null,
      principal_id varchar,
      resource_id varchar not null,
      scope varchar not null
    )
  `
];

const entraAppRoleAssignmentSchemaSql = [
  `
    create table if not exists entra_app_role_assignments (
      ordinal integer not null,
      id varchar primary key,
      app_role_id varchar not null,
      app_role_display_name varchar,
      app_role_value varchar,
      principal_id varchar not null,
      principal_display_name varchar,
      resource_id varchar not null,
      resource_display_name varchar
    )
  `
];

const azureResourcesSnapshotSchemaSql = [
  "create table if not exists azure_resources_snapshot_meta (data json not null)",
  "create table if not exists azure_resources_snapshot_extra (data json not null)"
];

const azureResourcesSchemaSql = [
  `
    create table if not exists azure_subscriptions (
      ordinal integer not null,
      subscription_id varchar primary key,
      subscription_name varchar not null,
      tenant_id varchar not null,
      state varchar not null,
      tags json
    )
  `,
  `
    create table if not exists azure_resource_groups (
      ordinal integer not null,
      subscription_id varchar not null,
      subscription_name varchar not null,
      resource_group varchar not null,
      location varchar not null,
      tags json
    )
  `,
  `
    create table if not exists azure_resources (
      ordinal integer not null,
      subscription_id varchar not null,
      subscription_name varchar not null,
      resource_id varchar primary key,
      resource_name varchar not null,
      resource_group varchar not null,
      resource_type varchar not null,
      kind varchar,
      location varchar not null,
      tags json,
      identity_type varchar,
      identity_principal_id varchar,
      identity_tenant_id varchar,
      user_assigned_identity_resource_ids json not null,
      user_assigned_identities json
    )
  `,
  `
    create table if not exists azure_user_assigned_managed_identities (
      ordinal integer not null,
      subscription_id varchar not null,
      subscription_name varchar not null,
      resource_id varchar primary key,
      name varchar not null,
      resource_group varchar not null,
      location varchar not null,
      client_id varchar not null,
      principal_id varchar not null,
      tenant_id varchar not null,
      tags json
    )
  `,
  `
    create table if not exists azure_role_assignments (
      ordinal integer not null,
      subscription_id varchar not null,
      subscription_name varchar not null,
      role_assignment_id varchar,
      scope varchar not null,
      scope_type varchar,
      scope_subscription_id varchar,
      scope_resource_group varchar,
      scope_resource_provider varchar,
      scope_resource_type varchar,
      scope_resource_name varchar,
      scope_management_group varchar,
      principal_id varchar not null,
      principal_type varchar,
      principal_display_name varchar,
      sign_in_name varchar,
      role_definition_id varchar,
      role_definition_name varchar,
      can_delegate boolean,
      condition varchar,
      condition_version varchar
    )
  `,
  `
    create table if not exists azure_activity_logs (
      ordinal integer not null,
      subscription_id varchar not null,
      subscription_name varchar not null,
      event_timestamp varchar not null,
      submission_timestamp varchar,
      caller varchar,
      caller_user_principal_name varchar,
      caller_name varchar,
      caller_email varchar,
      caller_object_id varchar,
      caller_identity_type varchar,
      caller_app_id varchar,
      caller_ip_address varchar,
      caller_tenant_id varchar,
      operation_name varchar,
      operation_name_value varchar,
      status varchar,
      sub_status varchar,
      category varchar,
      resource_group_name varchar,
      resource_id varchar,
      resource_provider_name varchar,
      resource_type varchar,
      authorization_action varchar,
      authorization_scope varchar
    )
  `
];

const disabledOwnerEvidenceSchemaSql = [
  `
    create table if not exists azure_disabled_owner_evidence_keys (
      owner_key varchar primary key,
      disabled_at varchar not null
    )
  `
];

const zeroTrustAssessmentMetadataSchemaSql = [
  `
    create table if not exists zta_report (
      id varchar not null primary key,
      file_name varchar not null,
      executed_at varchar,
      imported_at varchar not null
    )
  `,
  `
    create table if not exists zta_report_meta (
      report_id varchar not null primary key,
      data json not null
    )
  `,
  `
    create table if not exists zta_report_extra (
      report_id varchar not null primary key,
      data json not null
    )
  `
];

const zeroTrustAssessmentTestSchemaSql = [
  `
    create table if not exists zta_tests (
      report_id varchar not null,
      ordinal integer not null,
      test_id varchar not null,
      title varchar,
      pillar varchar,
      status varchar,
      risk varchar,
      impact varchar,
      implementation_cost varchar,
      category varchar,
      sfi_pillar varchar,
      skipped_reason varchar,
      skipped_code varchar,
      minimum_license json,
      applies_to json,
      tags json,
      related_objects json,
      result varchar,
      description varchar,
      data json not null,
      primary key (report_id, ordinal)
    )
  `,
  `
    create table if not exists zta_test_related_objects (
      report_id varchar not null,
      test_ordinal integer not null,
      related_object_id varchar not null,
      primary key (report_id, test_ordinal, related_object_id)
    )
  `
];

const zeroTrustAssessmentSchemaSql = [
  ...zeroTrustAssessmentMetadataSchemaSql,
  ...zeroTrustAssessmentTestSchemaSql
];

const azureIdentityEnrichmentSchemaSql = [
  `
    create table if not exists azure_runtime_enrichment_runs (
      run_id varchar primary key,
      started_at varchar not null,
      completed_at varchar,
      status varchar not null,
      identity_role_assignment_count integer not null,
      access_risk_identity_count integer not null,
      managed_identity_assignment_count integer not null,
      error_message varchar
    )
  `,
  `
    create table if not exists azure_identity_role_assignment_enrichment (
      run_id varchar not null,
      principal_id varchar not null,
      assignment_count integer not null,
      role_assignments json not null
    )
  `,
  `
    create table if not exists azure_identity_access_risk_enrichment (
      run_id varchar not null,
      principal_id varchar not null,
      risk_level varchar not null,
      assignment_count integer not null,
      high_risk_assignment_count integer not null,
      broad_scope_assignment_count integer not null,
      role_assignments json not null
    )
  `,
  `
    create table if not exists azure_managed_identity_assignment_enrichment (
      run_id varchar not null,
      service_principal_id varchar not null,
      principal_id varchar not null,
      client_id varchar not null,
      assignment_count integer not null,
      assigned_resource_groups json not null,
      managed_identity_assignments json not null
    )
  `
];

const runtimeSchemaSql = [
  ...entraSnapshotSchemaSql,
  ...entraServicePrincipalSchemaSql,
  ...entraApplicationSchemaSql,
  ...entraOAuth2PermissionGrantSchemaSql,
  ...entraAppRoleAssignmentSchemaSql,
  ...azureResourcesSnapshotSchemaSql,
  ...azureResourcesSchemaSql,
  ...disabledOwnerEvidenceSchemaSql,
  ...zeroTrustAssessmentSchemaSql,
  ...azureIdentityEnrichmentSchemaSql
];

export async function prepareRuntimeSqlSchema(connection: DuckDBConnection): Promise<void> {
  await runSqlSchema(connection, runtimeSchemaSql);
}

async function runSqlSchema(connection: DuckDBConnection, statements: string[]): Promise<void> {
  for (const statement of statements) {
    await connection.run(statement);
  }
}
