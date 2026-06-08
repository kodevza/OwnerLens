import { normalizeUserAssignedIdentityAssignments } from "./userAssignedIdentityAssignments.ts";

const firstIdentityResourceId =
  "/subscriptions/sub-1/resourceGroups/rg-a/providers/Microsoft.ManagedIdentity/userAssignedIdentities/identity-a";
const secondIdentityResourceId =
  "/subscriptions/sub-1/resourceGroups/rg-b/providers/Microsoft.ManagedIdentity/userAssignedIdentities/identity-b";

test("normalizes user-assigned identity assignments", () => {
  const assignments = normalizeUserAssignedIdentityAssignments({
    [firstIdentityResourceId]: {
      clientId: "client-a",
      principalId: "principal-a"
    },
    [secondIdentityResourceId]: {
      ClientId: "client-b",
      PrincipalId: "principal-b"
    }
  });

  expect(assignments).toEqual([
    {
      resourceId: firstIdentityResourceId,
      clientId: "client-a",
      principalId: "principal-a"
    },
    {
      resourceId: secondIdentityResourceId,
      clientId: "client-b",
      principalId: "principal-b"
    }
  ]);
});
