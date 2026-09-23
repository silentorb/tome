import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  auditRelationColumnOrientation,
  migrateRelationshipOrder,
} from "../../src/migrations/relationship-order";
import { ContentStore } from "../../src/content/store";
import { serializeAssociationsFile } from "../../src/content/associations-file";
import { serializeTableSchemasFile } from "../../src/content/table-schemas-file";

const SET_ASSOC = "01ARZ3NDEKTSV4RRFFQ69G5FA0";
const PACING_ASSOC = "01ARZ3NDEKTSV4RRFFQ69G5FA1";
const INSPIRATIONS = "01ARZ3NDEKTSV4RRFFQ69G5FB0";
const PACING_TYPES = "01ARZ3NDEKTSV4RRFFQ69G5FB1";
const MEMBER = "01ARZ3NDEKTSV4RRFFQ69G5FB2";
const DAYS = "01ARZ3NDEKTSV4RRFFQ69G5FB3";

function writeFixture(root: string): void {
  mkdirSync(resolve(root, "model"), { recursive: true });
  mkdirSync(resolve(root, "data", "relationships"), { recursive: true });
  writeFileSync(
    resolve(root, "model", "associations.json"),
    serializeAssociationsFile({
      version: 1,
      associations: {
        [SET_ASSOC]: {
          perspectives: ["Members", "Membership"],
          traits: ["set"],
        },
        [PACING_ASSOC]: {
          perspectives: ["Inspirations", "Pacing"],
          endpoints: {
            "0": { typeId: INSPIRATIONS },
            "1": { typeId: PACING_TYPES },
          },
        },
      },
    }),
    "utf-8",
  );
  writeFileSync(
    resolve(root, "model", "table-schemas.json"),
    serializeTableSchemasFile({
      version: 1,
      tables: {
        [INSPIRATIONS]: {
          columns: [
            {
              key: "pacing",
              name: "Pacing",
              type: "relation",
              association: PACING_ASSOC,
              endpoint: 0,
            },
          ],
        },
        [PACING_TYPES]: {
          columns: [
            {
              key: "inspirations",
              name: "Inspirations",
              type: "relation",
              association: PACING_ASSOC,
              endpoint: 1,
            },
          ],
        },
      },
    }),
    "utf-8",
  );

  const store = new ContentStore(root);
  store.writeRelationshipsFile({
    version: 4,
    relationships: [
      { a: INSPIRATIONS, b: MEMBER, type: SET_ASSOC },
      { a: PACING_TYPES, b: DAYS, type: SET_ASSOC },
      // Inverted: pacing type at a, inspiration member at b (empty Inspirations.pacing column).
      { a: DAYS, b: MEMBER, type: PACING_ASSOC },
    ],
  });
}

describe("migrateRelationshipOrder", () => {
  test("swaps inverted asymmetric tuples using set-trait membership", () => {
    const root = mkdtempSync(resolve(tmpdir(), "rel-order-"));
    try {
      writeFixture(root);

      const before = auditRelationColumnOrientation(root, { minWrong: 1 });
      expect(before.some((i) => i.columnKey === "pacing" && i.wrong === 1)).toBe(true);

      const report = migrateRelationshipOrder(root);
      expect(report.reordered).toBeGreaterThanOrEqual(1);

      const store = new ContentStore(root);
      const pacing = store
        .readRelationshipsFile()
        .relationships.filter((r) => r.type === PACING_ASSOC);
      expect(pacing).toHaveLength(1);
      expect(pacing[0]).toMatchObject({ a: MEMBER, b: DAYS, type: PACING_ASSOC });

      const after = auditRelationColumnOrientation(root, { minWrong: 1 });
      expect(after.filter((i) => i.association === PACING_ASSOC)).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
