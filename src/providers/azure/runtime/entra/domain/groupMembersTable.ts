import type { DuckDBConnection } from "@duckdb/node-api";

import type { EntraUserGroupMembershipResponse } from "../../../../../core/azure/entra/types";
import type { InputEntraGroupMember } from "../../../inputTransferObject/generated/EntraSnapshot";

export async function insertEntraGroupMemberRows(
  connection: DuckDBConnection,
  groupMembers: InputEntraGroupMember[] = []
): Promise<void> {
  for (const [ordinal, groupMember] of groupMembers.entries()) {
    await connection.run(
      `insert into entra_group_members values (
        $ordinal,
        lower($groupId),
        $groupDisplayName,
        lower($memberId),
        $memberDisplayName,
        $memberType,
        $memberUserPrincipalName,
        $memberMail,
        lower($memberAppId),
        $memberServicePrincipalType
      )`,
      {
        ordinal,
        groupId: groupMember.groupId,
        groupDisplayName: groupMember.groupDisplayName,
        memberId: groupMember.memberId,
        memberDisplayName: groupMember.memberDisplayName,
        memberType: groupMember.memberType,
        memberUserPrincipalName: groupMember.memberUserPrincipalName,
        memberMail: groupMember.memberMail,
        memberAppId: groupMember.memberAppId,
        memberServicePrincipalType: groupMember.memberServicePrincipalType ?? null
      }
    );
  }
}

export async function readEntraGroupMemberRows(
  connection: DuckDBConnection
): Promise<InputEntraGroupMember[]> {
  return readRows<InputEntraGroupMember>(
    connection,
    `select
      group_id as groupId,
      group_display_name as groupDisplayName,
      member_id as memberId,
      member_display_name as memberDisplayName,
      member_type as memberType,
      member_user_principal_name as memberUserPrincipalName,
      member_mail as memberMail,
      member_app_id as memberAppId,
      member_service_principal_type as memberServicePrincipalType
    from entra_group_members
    order by ordinal`
  );
}

export async function readEntraUserGroupMembership(
  connection: DuckDBConnection,
  user: string
): Promise<EntraUserGroupMembershipResponse> {
  const normalizedUser = user.trim().toLowerCase();
  const groups = await readRows<EntraUserGroupMembershipResponse["groups"][number]>(
    connection,
    `select distinct
      group_id as groupId,
      group_display_name as groupDisplayName
    from entra_group_members
    where lower(coalesce(member_type, '')) = 'user'
      and (
        lower(member_id) = $user
        or lower(coalesce(member_user_principal_name, '')) = $user
        or lower(coalesce(member_mail, '')) = $user
        or lower(coalesce(member_display_name, '')) = $user
      )
    order by lower(coalesce(group_display_name, '')), group_id`,
    { user: normalizedUser }
  );

  return {
    user: normalizedUser,
    groups
  };
}

async function readRows<Row extends object>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, string>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}
