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

describe("user-settings API", () => {
  test("GET and PATCH /api/user-settings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-user-settings-api-"));
    const settingsPath = join(dir, "user-settings.json");
    const dbPath = join(dir, "api.sqlite");

    const fixture = createTestContentFixture("tome-user-settings-content-");
    seedTestNode(fixture, {
      id: "00000000000000000000000001",
      properties: { title: "Alpha" },
    });

    fixture.ctx.sync.fullRebuild();
    const { handler: apiHandler } = createTestApi({
      dbPath,
      contentDir: fixture.ctx.store.contentDir,
      settingsPath,
    });

    const initial = await apiHandler(new Request("http://127.0.0.1/api/user-settings"));
    expect(initial.status).toBe(200);
    expect((await initial.json()).settings).toEqual({ version: 1 });

    const patched = await apiHandler(
      new Request("http://127.0.0.1/api/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableSorts: {
            "records/00000000000000000000000001/relations/RELATED": {
              orderBy: [{ column: "priority", direction: "desc" }],
            },
          },
        }),
      }),
    );
    expect(patched.status).toBe(200);
    const payload = (await patched.json()) as {
      settings: { tableSorts?: Record<string, unknown> };
    };
    expect(
      payload.settings.tableSorts?.["records/00000000000000000000000001/relations/RELATED"],
    ).toEqual({
      orderBy: [{ column: "priority", direction: "desc" }],
    });

    apiHandler.close();
    destroyTestContentFixture(fixture);
    rmSync(dir, { recursive: true, force: true });
  });
});
