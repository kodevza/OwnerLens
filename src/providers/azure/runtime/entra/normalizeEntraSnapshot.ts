import type { EntraSnapshot } from "../../inputTransferObject/generated/EntraSnapshot";

export type NormalizedEntraSnapshot<TSnapshot extends EntraSnapshot = EntraSnapshot> = TSnapshot &
  Required<Pick<EntraSnapshot, "applications" | "oauth2PermissionGrants" | "appRoleAssignments" | "groupMembers">>;

export function normalizeEntraSnapshot<TSnapshot extends EntraSnapshot>(snapshot: TSnapshot): NormalizedEntraSnapshot<TSnapshot> {
  return {
    ...snapshot,
    applications: snapshot.applications ?? [],
    oauth2PermissionGrants: snapshot.oauth2PermissionGrants ?? [],
    appRoleAssignments: snapshot.appRoleAssignments ?? [],
    groupMembers: snapshot.groupMembers ?? []
  };
}
