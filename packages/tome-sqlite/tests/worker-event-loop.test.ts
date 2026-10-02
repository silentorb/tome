import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openWorkerSqliteCache } from "../src/async-cache";

describe("openWorkerSqliteCache", () => {
  test("long query does not block the main event loop", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-sqlite-worker-"));
    const cache = await openWorkerSqliteCache({
      dbPath: join(dir, "test.sqlite"),
      clean: true,
    });

    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
    }, 5);

    try {
      // Busy SQL on the worker thread — main thread should still process timers.
      await cache.queryAll(`
        WITH RECURSIVE cnt(x) AS (
          SELECT 1
          UNION ALL
          SELECT x + 1 FROM cnt WHERE x < 200000
        )
        SELECT COUNT(*) AS n FROM cnt
      `);
      expect(tick).toBeGreaterThan(0);
    } finally {
      clearInterval(timer);
      await cache.close();
    }
  });
});
