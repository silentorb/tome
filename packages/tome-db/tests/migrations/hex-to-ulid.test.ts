import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  buildIdMap,
  collectMappableIds,
  migrateHexToUlid,
  remapText,
  residualBodyTokens,
  residualStructuralTokens,
} from "../../src/migrations/hex-to-ulid";
import { NODE_ID_PATTERN } from "../../src/node-id";

const A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DANGLING = "cccccccccccccccccccccccccccccccc";

let root: string;
let dataDir: string;
let modelDir: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "hex-to-ulid-"));
  dataDir = resolve(root, "data");
  modelDir = resolve(root, "model");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(modelDir, { recursive: true });

  writeFileSync(
    resolve(dataDir, `${A}.md`),
    `---\ntitle: A\n---\n# A\n\nLinks to [[${B}]] and [dangling](./${DANGLING}.md).\n` +
      `External: https://notion.site/Page-0123456789abcdef0123456789abcdef\n`,
    "utf-8",
  );
  writeFileSync(resolve(dataDir, `${B}.md`), `---\ntitle: B\n---\n# B\n\nSee [A](./${A}.md).\n`, "utf-8");
  writeFileSync(
    resolve(dataDir, "relationships.json"),
    JSON.stringify({ version: 2, relationships: [{ a: A, b: B, type: "member_of" }] }, null, 2),
    "utf-8",
  );
  // Model config references B as a type table + the dangling id (deleted node still in config).
  writeFileSync(
    resolve(modelDir, "table-schemas.json"),
    JSON.stringify(
      { version: 1, tables: { [B]: { columns: [] }, [DANGLING]: { columns: [] } } },
      null,
      2,
    ),
    "utf-8",
  );
  writeFileSync(
    resolve(modelDir, "views.json"),
    JSON.stringify(
      { version: 2, views: [{ nodeId: B, id: "all", relationshipType: "member_of" }] },
      null,
      2,
    ),
    "utf-8",
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("remapText", () => {
  test("replaces only mapped tokens", () => {
    const map = new Map([[A, "01ARZ3NDEKTSV4RRFFQ69G5FAV"]]);
    expect(remapText(`x ${A} y ${B}`, map)).toBe(`x 01ARZ3NDEKTSV4RRFFQ69G5FAV y ${B}`);
  });

  test("does not match inside a longer hex run", () => {
    const map = new Map([[A, "01ARZ3NDEKTSV4RRFFQ69G5FAV"]]);
    const longer = `${A}ff`;
    expect(remapText(longer, map)).toBe(longer);
  });
});

describe("buildIdMap", () => {
  test("assigns a unique ULID per id", () => {
    const map = buildIdMap([A, B, DANGLING]);
    expect(map.size).toBe(3);
    const values = [...map.values()];
    expect(new Set(values).size).toBe(3);
    for (const v of values) expect(NODE_ID_PATTERN.test(v)).toBe(true);
  });
});

describe("collectMappableIds", () => {
  test("includes file-backed and config-only (dangling) ids, excludes url hashes", () => {
    const ids = collectMappableIds(root);
    expect(ids).toContain(A);
    expect(ids).toContain(B);
    expect(ids).toContain(DANGLING);
    expect(ids).not.toContain("0123456789abcdef0123456789abcdef");
  });
});

describe("migrateHexToUlid", () => {
  test("renames files, remaps refs, leaves url hashes intact", () => {
    const report = migrateHexToUlid(root);
    expect(report.fileBackedCount).toBe(2);
    expect(report.mappedCount).toBe(3);

    const files = readdirSync(dataDir).filter((n) => n.endsWith(".md"));
    for (const f of files) {
      expect(NODE_ID_PATTERN.test(f.slice(0, -3))).toBe(true);
    }

    // No hex left in structural config.
    expect(residualStructuralTokens(root)).toEqual([]);

    // The external Notion URL hash is preserved in the body.
    const body = files
      .map((f) => readFileSync(resolve(dataDir, f), "utf-8"))
      .join("\n");
    expect(body).toContain("Page-0123456789abcdef0123456789abcdef");

    // Body residual is only the url hash.
    const residual = residualBodyTokens(root);
    const allResidual = [...residual.values()].flat();
    expect(allResidual).toEqual(["0123456789abcdef0123456789abcdef"]);

    // Relationship + view refs became ULIDs.
    const rels = readFileSync(resolve(dataDir, "relationships.json"), "utf-8");
    const newA = report.idMap.get(A)!;
    const newB = report.idMap.get(B)!;
    expect(rels).toContain(newA);
    expect(rels).toContain(newB);

    const views = readFileSync(resolve(modelDir, "views.json"), "utf-8");
    expect(views).toContain(newB);
  });

  test("is idempotent (second run is a no-op)", () => {
    migrateHexToUlid(root);
    const second = migrateHexToUlid(root);
    expect(second.fileBackedCount).toBe(0);
    expect(second.mappedCount).toBe(0);
    expect(second.filesRewritten).toBe(0);
  });
});
