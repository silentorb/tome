/** Stable ULIDs for the identity corpus fixture (Account / Permission / IdP Binding). */
export const IDENTITY_CORPUS_ID = "identity";

/** Default mock-IdP subject used by Alice's seeded binding and oidc tests. */
export const IDENTITY_ALICE_OIDC_SUBJECT = "alice@example.com";

/** Stable issuer for Alice's fixture binding (resolver unit tests / dogfood placeholder). */
export const IDENTITY_ALICE_OIDC_ISSUER = "https://idp.example.test";

export const IDENTITY_CORPUS_IDS = {
  home: "01M56A00000000000000000001",
  archive: "01M56A00000000000000000002",
  accountType: "01M56A00000000000000000010",
  permissionType: "01M56A00000000000000000011",
  idpBindingType: "01M56A00000000000000000012",
  setRel: "01M56A00000000000000000020",
  setRoleMembers: "01M56A00000000000000000021",
  setRoleMembership: "01M56A00000000000000000022",
  hasPermRel: "01M56A00000000000000000030",
  hasPermRoleUser: "01M56A00000000000000000031",
  hasPermRolePerm: "01M56A00000000000000000032",
  hasIdpBindingRel: "01M56A00000000000000000033",
  hasIdpBindingRoleAccount: "01M56A00000000000000000034",
  hasIdpBindingRoleBinding: "01M56A00000000000000000035",
  accountAlice: "01M56A00000000000000000040",
  accountBob: "01M56A00000000000000000041",
  permCanEdit: "01M56A00000000000000000050",
  /** Alice's OIDC binding; issuer is filled at seed/test time from the live IdP URL when needed. */
  bindingAliceOidc: "01M56A00000000000000000060",
} as const;
