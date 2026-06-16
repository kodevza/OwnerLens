import { readFileSync } from "node:fs";
import { join } from "node:path";

const script = readFileSync(join(process.cwd(), "tools/prepare-entra-snapshot.ps1"), "utf8");

test("Entra snapshot preparation imports Graph modules used for permission grants", () => {
  expect(script).toContain('"Microsoft.Graph.Applications"');
  expect(script).toContain("Import-Module $moduleName -ErrorAction Stop");
});

test("Entra snapshot preparation reads delegated grants through Graph REST", () => {
  expect(script).toContain("Get-EntraOAuth2PermissionGrants");
  expect(script).toContain("/v1.0/oauth2PermissionGrants");
  expect(script).toContain("Invoke-MgGraphRequest");
  expect(script).toContain("Add-OAuth2PermissionGrantSnapshot");
  expect(script).not.toContain("Get-MgOauth2PermissionGrant");
  expect(script).not.toContain("Get-MgServicePrincipalOauth2PermissionGrant");
});

test("Entra snapshot preparation reads app role assignments through Graph REST", () => {
  expect(script).toContain("Get-EntraServicePrincipalAppRoleAssignmentsBatch");
  expect(script).toContain("/servicePrincipals/$($sp.Id)/appRoleAssignments");
  expect(script).toContain('/v1.0/`$batch');
  expect(script).toContain("Invoke-MgGraphRequest");
  expect(script).not.toContain("Get-MgServicePrincipalAppRoleAssignment");
});

test("Entra snapshot preparation records group members separately from groups", () => {
  expect(script).toContain("groupMembers = @()");
  expect(script).toContain("Get-EntraGroupMembersIncludingServicePrincipals");
  expect(script).toContain("ConvertTo-GroupMemberSnapshot");
  expect(script).toContain("$snapshot.groupMembers += $memberSnapshot");
  expect(script).toContain("$snapshot.meta.groupMemberCount = $snapshot.groupMembers.Count");
});

test("Entra snapshot preparation uses beta Graph group members when v1.0 omits service principals", () => {
  expect(script).toContain("Get-EntraGroupMembersIncludingServicePrincipals");
  expect(script).toContain("Invoke-MgGraphRequest");
  expect(script).toContain("/beta/groups/$($GroupId)/members");
});

test("Entra snapshot preparation logs progress before Graph operations", () => {
  expect(script).toContain("function Write-EntraSnapshotProgress");
  expect(script).toContain('Write-EntraSnapshotProgress "Checking Microsoft Graph context"');
  expect(script).toContain('Write-EntraSnapshotProgress "Loading service principals from Microsoft Graph"');
  expect(script).toContain('Write-EntraSnapshotProgress "Loading applications from Microsoft Graph"');
  expect(script).toContain('Write-EntraSnapshotProgress "Loading global OAuth2 permission grants from Microsoft Graph REST"');
  expect(script).toContain("Loading app role assignments from Microsoft Graph REST batch");
  expect(script).toContain('Write-EntraSnapshotProgress "Loading groups from Microsoft Graph"');
  expect(script).toContain("Loading group members for group");
});
