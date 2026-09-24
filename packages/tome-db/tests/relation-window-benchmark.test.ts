import { TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID } from "../src/content/test-helpers";
import { describe, expect, test } from "bun:test";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase, relationshipId } from "tome-sqlite";
import { getRelationTableSection } from "../src/node-page-sections";
import {
  contentModelDir,
  associationsFilePath,
  projectionTypeForEndpoint,
  serializeAssociationsFile,
  invalidateAssociationsCache,
} from "tome-flatfile";

const RELATED_COUNT = 9000;
const WINDOW_LIMIT = 50;
const WINDOW_OFFSET = 4500;
/** Rows per multi-row INSERT — keeps statement size sane (bind limit is not the bottleneck). */
const INSERT_BATCH = 500;

/** Opt-out gate: set `TOME_BENCHMARK=0` (or `false` / `off`) to skip. Default enabled. */
const BENCHMARK_ENABLED = !["0", "false", "off"].includes(
  (process.env.TOME_BENCHMARK ?? "1").trim().toLowerCase(),
);

function writeInspirationsFeaturesAssociations(contentDir: string): void {
  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile({
      version: 1,
      associations: {
        "000000000000000000000000A1": {
          perspectives: ["Members", { title: "Membership", linkAdd: "Link type table" }],
          traits: ["set"],
        },
        "000000000000000000000000B2": {
          perspectives: ["Features", "Inspirations"],
        },
      },
    }),
  );
  invalidateAssociationsCache();
}

function insertBatched(
  seedDb: Database,
  sqlPrefix: string,
  placeholdersPerRow: string,
  rows: SQLQueryBindings[][],
): void {
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH) {
    const chunk = rows.slice(offset, offset + INSERT_BATCH);
    const valuesSql = chunk.map(() => `(${placeholdersPerRow})`).join(", ");
    const params = chunk.flat() as SQLQueryBindings[];
    seedDb.prepare(`${sqlPrefix} VALUES ${valuesSql}`).run(...params);
  }
}

/** Fixture only — not under test. Raw SQL bypasses GraphDatabase mutation APIs. */
function seedRelatedFanOut(
  dbPath: string,
  hostId: string,
  perspective: string,
): number {
  const seedStarted = performance.now();
  const seedDb = new Database(dbPath);
  const populate = seedDb.transaction(() => {
    const nodeRows: SQLQueryBindings[][] = [[hostId, "Busy host"]];
    const recordRows: SQLQueryBindings[][] = [];
    const projectionRows: SQLQueryBindings[][] = [];

    for (let i = 0; i < RELATED_COUNT; i++) {
      const targetId = `01BENCHTGT${String(i).padStart(16, "0")}`;
      const edgeId = relationshipId(hostId, perspective, targetId);
      nodeRows.push([targetId, `Feature ${String(i).padStart(4, "0")}`]);
      recordRows.push([edgeId, hostId, targetId, perspective, i]);
      projectionRows.push([edgeId, edgeId, hostId, targetId, perspective, i]);
    }

    insertBatched(
      seedDb,
      "INSERT INTO nodes (id, title, is_archived)",
      "?, ?, 0",
      nodeRows,
    );
    insertBatched(
      seedDb,
      `INSERT INTO relationship_records (id, node_a, node_b, composite_type, ordinal)`,
      "?, ?, ?, ?, ?",
      recordRows,
    );
    insertBatched(
      seedDb,
      `INSERT INTO relationship_projections (id, record_id, source_node_id, target_node_id, type, ordinal)`,
      "?, ?, ?, ?, ?, ?",
      projectionRows,
    );
  });
  populate();
  seedDb.close();
  return performance.now() - seedStarted;
}

describe("relation-window benchmark", () => {
  // Setup lives inside the test so TOME_BENCHMARK=0 skips GraphDatabase / temp dirs too.
  test.skipIf(!BENCHMARK_ENABLED)(
    "SQL-windows a mid-range page of 50 over 9000 related projections",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "tome-db-rel-window-bench-"));
      const contentDir = join(dir, "content");
      mkdirSync(contentModelDir(contentDir), { recursive: true });
      writeInspirationsFeaturesAssociations(contentDir);
      process.env.TOME_CONTENT_PATH = contentDir;
      const db = new GraphDatabase(join(dir, "test.sqlite"));

      try {
        const hostId = "01BENCHHOST00000000000000";
        const perspective = projectionTypeForEndpoint(TEST_INSPIRATIONS_FEATURES_ASSOCIATION_ID, 0);

        const seedMs = seedRelatedFanOut(db.path, hostId, perspective);

        const queryStarted = performance.now();
        const section = getRelationTableSection(db, hostId, perspective, {
          contentDir,
          rowsQuery: { limit: WINDOW_LIMIT, offset: WINDOW_OFFSET },
        });
        const queryMs = performance.now() - queryStarted;

        console.log(
          `[relation-window-benchmark] query=${queryMs.toFixed(1)}ms seed=${seedMs.toFixed(1)}ms related=${RELATED_COUNT} window=${WINDOW_OFFSET}+${WINDOW_LIMIT}`,
        );

        expect(section?.rowsWindow).toEqual({
          offset: WINDOW_OFFSET,
          limit: WINDOW_LIMIT,
          total: RELATED_COUNT,
          hasMore: true,
        });
        expect(section?.rows).toHaveLength(WINDOW_LIMIT);
        expect(section?.rows[0]?.name).toBe(`Feature ${String(WINDOW_OFFSET).padStart(4, "0")}`);
        expect(section?.rows[WINDOW_LIMIT - 1]?.name).toBe(
          `Feature ${String(WINDOW_OFFSET + WINDOW_LIMIT - 1).padStart(4, "0")}`,
        );
      } finally {
        db.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    { timeout: 30_000 },
  );
});
