export const remediationSchemaSql = [
  `
    create table if not exists remediation_packages (
      id varchar primary key,
      created_at varchar not null,
      source_kind varchar not null,
      source_label varchar not null,
      source_query json not null,
      task_count integer not null
    )
  `,
  `
    create table if not exists remediation_tasks (
      id varchar primary key,
      package_id varchar not null,
      created_at varchar not null,
      status varchar not null,
      target_kind varchar not null,
      target_id varchar not null,
      target_label varchar not null,
      title varchar not null,
      risk varchar,
      source_evidence json not null
    )
  `
];
