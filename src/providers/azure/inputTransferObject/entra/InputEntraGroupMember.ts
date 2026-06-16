export type InputEntraGroupMemberType = "servicePrincipal" | "user" | "group" | "device" | "unknown";

export type InputEntraGroupMember = {
  groupId: string;
  groupDisplayName: string | null;
  memberId: string;
  memberDisplayName: string | null;
  memberType: InputEntraGroupMemberType;
  memberUserPrincipalName: string | null;
  memberMail: string | null;
  memberAppId: string | null;
  memberServicePrincipalType?: string | null;
};
