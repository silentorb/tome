import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
} from "tome-db/content/test-helpers";
import { createTestApi } from "./test-api-setup";

describe("recent nodes API", async () => {
  test("GET /api/nodes/recent returns nodes ordered by modified_at", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-recent-nodes-api-"));
    const dbPath = join(dir, "api.sqlite");

    const fixture = await createTestContentFixture("tome-recent-nodes-content-");
    const olderId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    const newerId = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
    await seedTestNode(fixture, {
      id: olderId,
      properties: {
        title: "Older",
        modified_at: "2024-01-01T00:00:00.000Z",
      },
    });
    await seedTestNode(fixture, {
      id: newerId,
      properties: {
        title: "Newer",
        modified_at: "2024-06-01T00:00:00.000Z",
      },
    });

    fixture.ctx.sync.fullRebuild();
    const { handler: apiHandler } = await createTestApi({ dbPath, contentDir: fixture.ctx.store.contentDir });

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
    await destroyTestContentFixture(fixture);
    rmSync(dir, { recursive: true, force: true });
  });
});
