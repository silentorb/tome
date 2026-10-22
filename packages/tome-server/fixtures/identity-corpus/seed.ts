/**
 * One-shot seed for the identity corpus fixture. Run from tome root:
 *   bun packages/tome-server/fixtures/identity-corpus/seed.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ContentStore,
  emptyRelationshipTypesFile,
  registerBidirectionalType,
  registerSetRelationshipType,
  serializeRelationshipTypesFile,
  serializeWorkspaceFile,
  serializeTableSchemasFile,
  serializeOntologyFile,
  emptyTableSchemasFile,
  WORKSPACE_FILE_VERSION,
  ONTOLOGY_FILE_VERSION,
} from "tome-flatfile";
import {
  IDENTITY_ALICE_OIDC_ISSUER,
  IDENTITY_ALICE_OIDC_SUBJECT,
  IDENTITY_CORPUS_ID,
  IDENTITY_CORPUS_IDS,
} from "./ids";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(fixtureDir, "content");

mkdirSync(join(root, "model"), { recursive: true });
mkdirSync(join(root, "data", "nodes"), { recursive: true });
mkdirSync(join(root, "data", "relationships"), { recursive: true });
mkdirSync(join(root, "archive", "nodes"), { recursive: true });
mkdirSync(join(root, "archive", "relationships"), { recursive: true });

const IDS = IDENTITY_CORPUS_IDS;

writeFileSync(
  join(root, "model", "corpus.json"),
  serializeWorkspaceFile({
    version: WORKSPACE_FILE_VERSION,
    homeNodeId: IDS.home,
    archiveNodeId: IDS.archive,
    protectedNodeIds: [IDS.home, IDS.archive],
    graphExplorer: { defaultAnchorNodeId: IDS.home },
    staticSite: { homeNodeId: IDS.home },
    quickLinks: [],
    branding: { appTitle: "Identity" },
  }),
);

const associations = emptyRelationshipTypesFile();
registerSetRelationshipType(associations, {
  id: IDS.setRel,
  perspectives: ["Members", "Membership"],
  roleIds: [IDS.setRoleMembers, IDS.setRoleMembership],
});
registerBidirectionalType(associations, "Users", "Permissions", IDS.hasPermRel, {
  roleIds: [IDS.hasPermRoleUser, IDS.hasPermRolePerm],
});
associations.relationshipTypes[IDS.hasPermRel]!.endpoints = {
  0: { typeId: IDS.accountType },
  1: { typeId: IDS.permissionType },
};
registerBidirectionalType(associations, "Accounts", "IdP Bindings", IDS.hasIdpBindingRel, {
  roleIds: [IDS.hasIdpBindingRoleAccount, IDS.hasIdpBindingRoleBinding],
});
associations.relationshipTypes[IDS.hasIdpBindingRel]!.endpoints = {
  0: { typeId: IDS.accountType },
  1: { typeId: IDS.idpBindingType },
};
writeFileSync(join(root, "model", "associations.json"), serializeRelationshipTypesFile(associations));

const tables = emptyTableSchemasFile();
tables.tables[IDS.accountType] = {
  columns: [{ key: "active", name: "Active", type: "checkbox" }],
};
tables.tables[IDS.permissionType] = {
  columns: [{ key: "key", name: "Key", type: "text" }],
};
tables.tables[IDS.idpBindingType] = {
  columns: [
    { key: "issuer", name: "Issuer", type: "text" },
    { key: "subject", name: "Subject", type: "text" },
  ],
};
writeFileSync(join(root, "model", "table-schemas.json"), serializeTableSchemasFile(tables));

writeFileSync(
  join(root, "model", "schema.json"),
  `${JSON.stringify({ version: 1, enums: {}, relationshipRules: [] }, null, 2)}\n`,
);

writeFileSync(
  join(root, "model", "ontology.json"),
  serializeOntologyFile({
    version: ONTOLOGY_FILE_VERSION,
    types: { idpBinding: IDS.idpBindingType },
  }),
);

const store = new ContentStore(root, { corpusId: IDENTITY_CORPUS_ID });
store.writeNode({ id: IDS.home, properties: { title: "Identity Home" } }, "");
store.writeNode({ id: IDS.archive, properties: { title: "Archive" } }, "");
store.writeNode({ id: IDS.accountType, properties: { title: "Account" } }, "");
store.writeNode({ id: IDS.permissionType, properties: { title: "Permission" } }, "");
store.writeNode({ id: IDS.idpBindingType, properties: { title: "IdP Binding" } }, "");
store.writeNode({ id: IDS.accountAlice, properties: { title: "Alice", active: true } }, "");
store.writeNode({ id: IDS.accountBob, properties: { title: "Bob", active: true } }, "");
store.writeNode(
  { id: IDS.permCanEdit, properties: { title: "can edit nodes", key: "can-edit-nodes" } },
  "",
);
store.writeNode(
  {
    id: IDS.bindingAliceOidc,
    properties: {
      title: "Alice OIDC",
      issuer: IDENTITY_ALICE_OIDC_ISSUER,
      subject: IDENTITY_ALICE_OIDC_SUBJECT,
    },
  },
  "",
);

store.upsertRelationship(IDS.accountType, IDS.accountAlice, IDS.setRel, {});
store.upsertRelationship(IDS.accountType, IDS.accountBob, IDS.setRel, {});
store.upsertRelationship(IDS.permissionType, IDS.permCanEdit, IDS.setRel, {});
store.upsertRelationship(IDS.idpBindingType, IDS.bindingAliceOidc, IDS.setRel, {});
store.upsertRelationship(IDS.accountAlice, IDS.permCanEdit, IDS.hasPermRel, {});
store.upsertRelationship(IDS.accountAlice, IDS.bindingAliceOidc, IDS.hasIdpBindingRel, {});

store.close();

writeFileSync(
  join(fixtureDir, "ids.json"),
  `${JSON.stringify(
    {
      corpusId: IDENTITY_CORPUS_ID,
      aliceOidcSubject: IDENTITY_ALICE_OIDC_SUBJECT,
      aliceOidcIssuer: IDENTITY_ALICE_OIDC_ISSUER,
      ...IDS,
    },
    null,
    2,
  )}\n`,
);

console.log(`seeded ${root}`);
