import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostsProjectionFilterGraph } from "tome-ontology";
import type { Properties } from "tome-graph-interfaces";
import {
  ContentStore,
  contentHasAuthorizationModelType,
  discoverAuthorizationModelInstanceIds,
  invalidateOntologyCache,
  invalidateRelationshipTypesCache,
  loadMemberScopesFromContent,
  loadRelationshipRuntimeFromContent,
  loadRelationshipTypesFromContent,
  nodeFilePath,
  ontologyFilePath,
  relationshipTypesFilePath,
  requireRelationshipTypeId,
  serializeNodeFile,
  serializeOntologyFile,
  serializeRelationshipTypesFile,
  emptyRelationshipTypesFile,
  registerSetRelationshipType,
  UnknownRelationshipTypeError,
} from "../src/index";

const SET_TYPE = "000000000000000000000000C1";
const ONTOLOGY_TYPE = "000000000000000000000000C2";
const PREDICATE_TYPE = "000000000000000000000000C3";
const ONTOLOGY_INST = "000000000000000000000000C4";
const PRED_ACTIVE = "000000000000000000000000C5";
const PRED_INACTIVE = "000000000000000000000000C6";
const MEMBER_SCOPE_TYPE = "000000000000000000000000C7";
const MEMBER_SCOPE_INST = "000000000000000000000000C8";
const TYPE_TABLE_HUB = "000000000000000000000000C9";
const AUTH_MODEL_TYPE = "000000000000000000000000D1";
const AUTH_MODEL_INST = "000000000000000000000000D2";
const RT_TYPE_HUB = "000000000000000000000000E1";
const RT_NODE_ONLY = "000000000000000000000000E2";
const RT_SHARED_ID = "000000000000000000000000E3";
const RT_INCOMPLETE = "000000000000000000000000E4";
const RT_ROLE_0 = "000000000000000000000000F1";
const RT_ROLE_1 = "000000000000000000000000F2";
const RT_ROLE_0B = "000000000000000000000000F3";
const RT_ROLE_1B = "000000000000000000000000F4";
const INSPIRES_TYPE = "01KXBNPNJDENZ9BXN5BYZ7JKPR";
const INSPIRES_ROLE_0 = "01M4PPCCVG03JT6SJE2B82V1HG";
const INSPIRES_ROLE_1 = "01M4PPCCVGMBQW1AX1YCCRZR6P";

function writeNode(
  contentDir: string,
  id: string,
  title: string,
  extras: Properties = {},
): void {
  const path = nodeFilePath(contentDir, id);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    serializeNodeFile({ id, properties: { title, ...extras } }, ""),
    "utf-8",
  );
}

describe("node ontology runtime overlay", () => {
  const dirs: string[] = [];
  afterEach(() => {
    invalidateRelationshipTypesCache();
    invalidateOntologyCache();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loads active predicates with node-filter; skips unlinked and associations-only unchanged", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-ontology-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });

    const registry = emptyRelationshipTypesFile();
    registerSetRelationshipType(registry, {
      id: SET_TYPE,
      perspectives: ["Members", "Membership"],
    });
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile(registry),
      "utf-8",
    );

    writeFileSync(
      ontologyFilePath(contentDir),
      serializeOntologyFile({
        version: 1,
        types: { ontology: ONTOLOGY_TYPE, predicate: PREDICATE_TYPE },
      }),
      "utf-8",
    );

    writeNode(contentDir, ONTOLOGY_TYPE, "Ontology type");
    writeNode(contentDir, PREDICATE_TYPE, "Predicate type");
    writeNode(contentDir, ONTOLOGY_INST, "Demo ontology");
    const filter = {
      nodes: {
        lit: { id: "lit", type: "literal", inputs: { value: true } },
      },
      edges: {},
    };
    writeNode(contentDir, PRED_ACTIVE, "Active predicate", {
      predicate: filter as unknown as Properties[string],
    });
    writeNode(contentDir, PRED_INACTIVE, "Inactive predicate", {
      predicate: filter as unknown as Properties[string],
    });

    const store = new ContentStore(contentDir);
    store.writeRelationshipsFile({
      version: 1,
      relationships: [
        { a: ONTOLOGY_TYPE, b: ONTOLOGY_INST, type: SET_TYPE },
        { a: PREDICATE_TYPE, b: PRED_ACTIVE, type: SET_TYPE },
        { a: PREDICATE_TYPE, b: PRED_INACTIVE, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: PRED_ACTIVE, type: SET_TYPE },
      ],
    });

    const runtime = loadRelationshipRuntimeFromContent(contentDir);
    expect(runtime.predicates.has(PRED_ACTIVE)).toBe(true);
    expect(runtime.predicates.has(PRED_INACTIVE)).toBe(false);
    expect(runtime.predicates.get(PRED_ACTIVE)?.nodeFilter?.nodes.lit?.inputs.value).toBe(true);
    // Set trait from associations still present
    expect(runtime.predicates.has(SET_TYPE)).toBe(true);
  });

  test("loads active member-scopes bound to a type table and predicate", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-member-scope-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });

    const registry = emptyRelationshipTypesFile();
    registerSetRelationshipType(registry, {
      id: SET_TYPE,
      perspectives: ["Members", "Membership"],
    });
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile(registry),
      "utf-8",
    );

    writeFileSync(
      ontologyFilePath(contentDir),
      serializeOntologyFile({
        version: 1,
        types: {
          ontology: ONTOLOGY_TYPE,
          predicate: PREDICATE_TYPE,
          memberScope: MEMBER_SCOPE_TYPE,
        },
      }),
      "utf-8",
    );

    writeNode(contentDir, ONTOLOGY_TYPE, "Ontology type");
    writeNode(contentDir, PREDICATE_TYPE, "Predicate type");
    writeNode(contentDir, MEMBER_SCOPE_TYPE, "Member scope type");
    writeNode(contentDir, ONTOLOGY_INST, "Demo ontology");
    writeNode(contentDir, TYPE_TABLE_HUB, "Inspirations hub");

    writeNode(contentDir, PRED_ACTIVE, "Inspiration", {
      predicate: hostsProjectionFilterGraph(
        "01KXBNPNJDENZ9BXN5BYZ7JKPR",
        0,
      ) as unknown as Properties[string],
    });

    writeNode(contentDir, MEMBER_SCOPE_INST, "Inspirations member scope", {
      memberScope: { typeTableId: TYPE_TABLE_HUB, predicateId: PRED_ACTIVE },
    });

    const store = new ContentStore(contentDir);
    store.writeRelationshipsFile({
      version: 1,
      relationships: [
        { a: ONTOLOGY_TYPE, b: ONTOLOGY_INST, type: SET_TYPE },
        { a: PREDICATE_TYPE, b: PRED_ACTIVE, type: SET_TYPE },
        { a: MEMBER_SCOPE_TYPE, b: MEMBER_SCOPE_INST, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: PRED_ACTIVE, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: MEMBER_SCOPE_INST, type: SET_TYPE },
      ],
    });

    const scopes = loadMemberScopesFromContent(contentDir);
    expect(scopes).toEqual([
      {
        id: MEMBER_SCOPE_INST,
        typeTableId: TYPE_TABLE_HUB,
        predicateId: PRED_ACTIVE,
        title: "Inspirations member scope",
      },
    ]);
    const runtime = loadRelationshipRuntimeFromContent(contentDir);
    expect(runtime.predicates.get(PRED_ACTIVE)?.nodeFilter?.nodes.hosts?.type).toBe(
      "hosts_projection",
    );
  });

  test("missing ontology.json leaves associations-only runtime", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-ontology-empty-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });
    const registry = emptyRelationshipTypesFile();
    registerSetRelationshipType(registry, {
      id: SET_TYPE,
      perspectives: ["Members", "Membership"],
    });
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile(registry),
      "utf-8",
    );
    const runtime = loadRelationshipRuntimeFromContent(contentDir);
    expect(runtime.predicates.size).toBe(1);
    expect(runtime.predicates.has(SET_TYPE)).toBe(true);
  });

  test("discovers Authorization Model instances from types.authorizationModel", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-authz-model-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });

    const registry = emptyRelationshipTypesFile();
    registerSetRelationshipType(registry, {
      id: SET_TYPE,
      perspectives: ["Members", "Membership"],
    });
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile(registry),
      "utf-8",
    );
    writeFileSync(
      ontologyFilePath(contentDir),
      serializeOntologyFile({
        version: 1,
        types: { authorizationModel: AUTH_MODEL_TYPE },
      }),
      "utf-8",
    );
    writeNode(contentDir, AUTH_MODEL_TYPE, "Authorization Model");
    writeNode(contentDir, AUTH_MODEL_INST, "Demo authz model");

    const store = new ContentStore(contentDir);
    store.writeRelationshipsFile({
      version: 1,
      relationships: [{ a: AUTH_MODEL_TYPE, b: AUTH_MODEL_INST, type: SET_TYPE }],
    });

    expect(contentHasAuthorizationModelType(contentDir)).toBe(true);
    expect(discoverAuthorizationModelInstanceIds(contentDir)).toEqual([AUTH_MODEL_INST]);
  });

  test("authorizationModel type key is optional", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-authz-optional-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });
    writeFileSync(
      ontologyFilePath(contentDir),
      serializeOntologyFile({
        version: 1,
        types: { ontology: ONTOLOGY_TYPE },
      }),
      "utf-8",
    );
    expect(contentHasAuthorizationModelType(contentDir)).toBe(false);
    expect(discoverAuthorizationModelInstanceIds(contentDir)).toEqual([]);
  });

  test("loads node-only relationship types into merged registry; skips incomplete", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-rt-node-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });

    const registry = emptyRelationshipTypesFile();
    registerSetRelationshipType(registry, {
      id: SET_TYPE,
      perspectives: ["Members", "Membership"],
    });
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile(registry),
      "utf-8",
    );
    writeFileSync(
      ontologyFilePath(contentDir),
      serializeOntologyFile({
        version: 1,
        types: {
          ontology: ONTOLOGY_TYPE,
          relationshipType: RT_TYPE_HUB,
        },
      }),
      "utf-8",
    );

    writeNode(contentDir, ONTOLOGY_TYPE, "Ontology type");
    writeNode(contentDir, RT_TYPE_HUB, "Relationship type");
    writeNode(contentDir, ONTOLOGY_INST, "Demo ontology");
    writeNode(contentDir, RT_NODE_ONLY, "Inspires", {
      relationshipType: {
        roles: ["Inspires", "Inspired by"],
        roleIds: [RT_ROLE_0, RT_ROLE_1],
        endpoints: { 0: { typeId: TYPE_TABLE_HUB }, 1: {} },
      },
    });
    writeNode(contentDir, RT_INCOMPLETE, "Broken", {
      relationshipType: { roles: ["Only one"] },
    });
    writeNode(contentDir, TYPE_TABLE_HUB, "Hub");

    const store = new ContentStore(contentDir);
    store.writeRelationshipsFile({
      version: 1,
      relationships: [
        { a: ONTOLOGY_TYPE, b: ONTOLOGY_INST, type: SET_TYPE },
        { a: RT_TYPE_HUB, b: RT_NODE_ONLY, type: SET_TYPE },
        { a: RT_TYPE_HUB, b: RT_INCOMPLETE, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: RT_NODE_ONLY, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: RT_INCOMPLETE, type: SET_TYPE },
      ],
    });

    const merged = loadRelationshipTypesFromContent(contentDir);
    expect(merged.relationshipTypes[RT_NODE_ONLY]?.perspectives).toEqual([
      "Inspires",
      "Inspired by",
    ]);
    expect(merged.relationshipTypes[RT_NODE_ONLY]?.roleIds).toEqual([RT_ROLE_0, RT_ROLE_1]);
    expect(merged.relationshipTypes[RT_NODE_ONLY]?.endpoints?.[0]?.typeId).toBe(TYPE_TABLE_HUB);
    expect(merged.relationshipTypes[RT_INCOMPLETE]).toBeUndefined();
    expect(requireRelationshipTypeId(merged, RT_NODE_ONLY)).toBe(RT_NODE_ONLY);
    expect(() => requireRelationshipTypeId(merged, RT_INCOMPLETE)).toThrow(
      UnknownRelationshipTypeError,
    );

    const runtime = loadRelationshipRuntimeFromContent(contentDir);
    expect(runtime.predicates.get(RT_NODE_ONLY)?.perspectives).toEqual([
      "Inspires",
      "Inspired by",
    ]);
    expect(runtime.predicates.has(SET_TYPE)).toBe(true);
  });

  test("node relationship type wins over associations entry on same id", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-rt-merge-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });

    const registry = emptyRelationshipTypesFile();
    registerSetRelationshipType(registry, {
      id: SET_TYPE,
      perspectives: ["Members", "Membership"],
    });
    registry.relationshipTypes[RT_SHARED_ID] = {
      perspectives: ["Old0", "Old1"],
      roleIds: [RT_ROLE_0, RT_ROLE_1],
    };
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile(registry),
      "utf-8",
    );
    writeFileSync(
      ontologyFilePath(contentDir),
      serializeOntologyFile({
        version: 1,
        types: {
          ontology: ONTOLOGY_TYPE,
          relationshipType: RT_TYPE_HUB,
        },
      }),
      "utf-8",
    );

    writeNode(contentDir, ONTOLOGY_TYPE, "Ontology type");
    writeNode(contentDir, RT_TYPE_HUB, "Relationship type");
    writeNode(contentDir, ONTOLOGY_INST, "Demo ontology");
    writeNode(contentDir, RT_SHARED_ID, "Renamed", {
      relationshipType: {
        roles: ["New0", "New1"],
        roleIds: [RT_ROLE_0B, RT_ROLE_1B],
      },
    });

    const store = new ContentStore(contentDir);
    store.writeRelationshipsFile({
      version: 1,
      relationships: [
        { a: ONTOLOGY_TYPE, b: ONTOLOGY_INST, type: SET_TYPE },
        { a: RT_TYPE_HUB, b: RT_SHARED_ID, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: RT_SHARED_ID, type: SET_TYPE },
      ],
    });

    const merged = loadRelationshipTypesFromContent(contentDir);
    expect(merged.relationshipTypes[RT_SHARED_ID]?.perspectives).toEqual(["New0", "New1"]);
    expect(merged.relationshipTypes[RT_SHARED_ID]?.roleIds).toEqual([RT_ROLE_0B, RT_ROLE_1B]);
  });

  test("Inspiration hosts_projection still resolves when Inspires is node-only", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-rt-inspires-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });

    const registry = emptyRelationshipTypesFile();
    registerSetRelationshipType(registry, {
      id: SET_TYPE,
      perspectives: ["Members", "Membership"],
    });
    writeFileSync(
      relationshipTypesFilePath(contentDir),
      serializeRelationshipTypesFile(registry),
      "utf-8",
    );
    writeFileSync(
      ontologyFilePath(contentDir),
      serializeOntologyFile({
        version: 1,
        types: {
          ontology: ONTOLOGY_TYPE,
          predicate: PREDICATE_TYPE,
          memberScope: MEMBER_SCOPE_TYPE,
          relationshipType: RT_TYPE_HUB,
        },
      }),
      "utf-8",
    );

    writeNode(contentDir, ONTOLOGY_TYPE, "Ontology type");
    writeNode(contentDir, PREDICATE_TYPE, "Predicate type");
    writeNode(contentDir, MEMBER_SCOPE_TYPE, "Member scope type");
    writeNode(contentDir, RT_TYPE_HUB, "Relationship type");
    writeNode(contentDir, ONTOLOGY_INST, "Demo ontology");
    writeNode(contentDir, TYPE_TABLE_HUB, "Inspirations hub");
    writeNode(contentDir, INSPIRES_TYPE, "Inspires", {
      relationshipType: {
        roles: ["Inspires", "Inspired by"],
        roleIds: [INSPIRES_ROLE_0, INSPIRES_ROLE_1],
        endpoints: { 0: { typeId: TYPE_TABLE_HUB }, 1: {} },
      },
    });
    writeNode(contentDir, PRED_ACTIVE, "Inspiration", {
      predicate: hostsProjectionFilterGraph(
        INSPIRES_TYPE,
        0,
      ) as unknown as Properties[string],
    });
    writeNode(contentDir, MEMBER_SCOPE_INST, "Inspirations member scope", {
      memberScope: { typeTableId: TYPE_TABLE_HUB, predicateId: PRED_ACTIVE },
    });

    const store = new ContentStore(contentDir);
    store.writeRelationshipsFile({
      version: 1,
      relationships: [
        { a: ONTOLOGY_TYPE, b: ONTOLOGY_INST, type: SET_TYPE },
        { a: RT_TYPE_HUB, b: INSPIRES_TYPE, type: SET_TYPE },
        { a: PREDICATE_TYPE, b: PRED_ACTIVE, type: SET_TYPE },
        { a: MEMBER_SCOPE_TYPE, b: MEMBER_SCOPE_INST, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: INSPIRES_TYPE, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: PRED_ACTIVE, type: SET_TYPE },
        { a: ONTOLOGY_INST, b: MEMBER_SCOPE_INST, type: SET_TYPE },
      ],
    });

    const merged = loadRelationshipTypesFromContent(contentDir);
    expect(requireRelationshipTypeId(merged, INSPIRES_TYPE)).toBe(INSPIRES_TYPE);
    expect(merged.relationshipTypes[INSPIRES_TYPE]?.roleIds).toEqual([
      INSPIRES_ROLE_0,
      INSPIRES_ROLE_1,
    ]);

    const scopes = loadMemberScopesFromContent(contentDir);
    expect(scopes[0]?.predicateId).toBe(PRED_ACTIVE);
    const runtime = loadRelationshipRuntimeFromContent(contentDir);
    expect(runtime.predicates.has(INSPIRES_TYPE)).toBe(true);
    const assocLiteral =
      runtime.predicates.get(PRED_ACTIVE)?.nodeFilter?.nodes.association?.inputs.value;
    expect(assocLiteral).toBe(INSPIRES_TYPE);
  });
});
