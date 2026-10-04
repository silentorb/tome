import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializePageBlock } from "tome-interfaces/page-block";
import {
  ContentStore,
  invalidateOntologyCache,
  invalidateRelationshipTypesCache,
  loadRelationshipRuntimeFromContent,
  nodeFilePath,
  ontologyFilePath,
  relationshipTypesFilePath,
  serializeNodeFile,
  serializeOntologyFile,
  serializeRelationshipTypesFile,
  emptyRelationshipTypesFile,
  registerSetRelationshipType,
} from "../src/index";

const SET_TYPE = "000000000000000000000000C1";
const ONTOLOGY_TYPE = "000000000000000000000000C2";
const PREDICATE_TYPE = "000000000000000000000000C3";
const ONTOLOGY_INST = "000000000000000000000000C4";
const PRED_ACTIVE = "000000000000000000000000C5";
const PRED_INACTIVE = "000000000000000000000000C6";

function writeNode(contentDir: string, id: string, title: string, body = ""): void {
  const path = nodeFilePath(contentDir, id);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    serializeNodeFile({ id, properties: { title } }, body),
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
    const filterBody = serializePageBlock(
      "node-filter",
      {
        nodes: {
          lit: { id: "lit", type: "literal", inputs: { value: true } },
        },
        edges: {},
      },
      "predicate",
    );
    writeNode(contentDir, PRED_ACTIVE, "Active predicate", `${filterBody}\n`);
    writeNode(contentDir, PRED_INACTIVE, "Inactive predicate", `${filterBody}\n`);

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
});
