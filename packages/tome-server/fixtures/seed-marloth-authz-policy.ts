/**
 * Seed Marloth Authorization Model instance + Policy node (can-edit-nodes Imp).
 * Run from tome root: bun packages/tome-server/fixtures/seed-marloth-authz-policy.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ContentStore,
  registerBidirectionalType,
} from "tome-flatfile";
import { buildCanEditNodesPolicyGraph } from "../src/authorization/can-edit-nodes-policy";

const AUTH_MODEL_TYPE = "01M55P880YPSCT71RH50KD7AZD";
const SET_REL = "01KXBNPNJDENZ9BXN5BYZ7JKPT";
const POLICY_TYPE = "01M56B00000000000000000010";
const MODEL_INSTANCE = "01M56B00000000000000000001";
const POLICY_NODE = "01M56B00000000000000000020";
const MODEL_POLICY_REL = "01M56B00000000000000000030";
const MODEL_POLICY_ROLE_A = "01M56B00000000000000000031";
const MODEL_POLICY_ROLE_B = "01M56B00000000000000000032";

const content = "/workspaces/silentorb-workbench/.mnt/marloth-story/content";
const store = new ContentStore(content);

store.writeNode({ id: POLICY_TYPE, properties: { title: "Policy" } }, "");
store.writeNode(
  { id: MODEL_INSTANCE, properties: { title: "Default Authorization Model" } },
  "",
);

const policyGraph = buildCanEditNodesPolicyGraph();
const policyBody = [
  "Authorization policy: node edits require the **can-edit-nodes** permission.",
  "",
  '```json {#policy type="authorization-policy"}',
  JSON.stringify(policyGraph, null, 2),
  "```",
  "",
].join("\n");
store.writeNode(
  {
    id: POLICY_NODE,
    properties: {
      title: "Node edit requires can-edit-nodes",
      appliesTo: "node.edit",
    },
  },
  policyBody,
);

store.upsertRelationship(AUTH_MODEL_TYPE, MODEL_INSTANCE, SET_REL, {});
store.upsertRelationship(POLICY_TYPE, POLICY_NODE, SET_REL, {});

const types = store.readRelationshipTypesFile();
if (!types.relationshipTypes[MODEL_POLICY_REL]) {
  registerBidirectionalType(types, "Models", "Policies", MODEL_POLICY_REL, {
    roleIds: [MODEL_POLICY_ROLE_A, MODEL_POLICY_ROLE_B],
  });
  types.relationshipTypes[MODEL_POLICY_REL]!.endpoints = {
    0: { typeId: AUTH_MODEL_TYPE },
    1: { typeId: POLICY_TYPE },
  };
  store.writeRelationshipTypesFile(types);
}
store.upsertRelationship(MODEL_INSTANCE, POLICY_NODE, MODEL_POLICY_REL, {});

const ontologyPath = join(content, "model/ontology.json");
const ontology = JSON.parse(await Bun.file(ontologyPath).text()) as {
  version: number;
  types: Record<string, string>;
};
ontology.types.authorizationPolicy = POLICY_TYPE;
writeFileSync(ontologyPath, `${JSON.stringify(ontology, null, 2)}\n`);

const schemas = store.readTableSchemasFile();
schemas.tables[POLICY_TYPE] = {
  columns: [{ key: "appliesTo", name: "Applies to", type: "text" }],
};
store.writeTableSchemasFile(schemas);

store.close();
console.log("marloth authz policy seeded");
