import type { AzureSnapshot } from "../../inputTransferObject/generated/AzureSnapshot";

export type NormalizedAzureSnapshot<TSnapshot extends AzureSnapshot = AzureSnapshot> = TSnapshot &
  Required<Pick<AzureSnapshot, "roleAssignments">>;

export function normalizeAzureSnapshot<TSnapshot extends AzureSnapshot>(snapshot: TSnapshot): NormalizedAzureSnapshot<TSnapshot> {
  return {
    ...snapshot,
    roleAssignments: snapshot.roleAssignments ?? []
  };
}
