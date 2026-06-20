import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "tome-db/content/test-helpers";
import { createApiHandler } from "../../src/api/server";

describe("recent nodes API", () => {
  test("GET /api/nodes/recent returns nodes ordered by modified_at", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-recent-nodes-api-"));
    const dbPath = join(dir, "api.sqlite");

    const fixture = createTestContentFixture("tome-recent-nodes-content-");
    const olderId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const newerId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    seedTestNode(fixture, {
      id: olderId,
      properties: {
        title: "Older",
        modified_at: "2024-01-01T00:00:00.000Z",
      },
    });
    seedTestNode(fixture, {
      id: newerId,
      properties: {
        title: "Newer",
        modified_at: "2024-06-01T00:00:00.000Z",
      },
    });

    fixture.ctx.sync.fullRebuild();
    const apiHandler = createApiHandler(dbPath, undefined, fixture.ctx.store.contentDir);

    const response = await apiHandler(
      new Request("http://127.0.0.1/api/nodes/recent?limit=8"),
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      results: Array<{ id: string; title: string }>;
    };
    expect(payload.results[0]?.id).toBe(newerId);
    expect(payload.results.some((row) => row.id === olderId)).toBe(true);

    apiHandler.close();
    destroyTestContentFixture(fixture);
    rmSync(dir, { recursive: true, force: true });
  });
});
