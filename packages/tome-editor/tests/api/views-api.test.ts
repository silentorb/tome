import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiHandler } from "../../src/api/server";
import { serializeViewsFile, serializeWorkspaceFile, VIEWS_FILE_VERSION } from "tome-db";
import { contentModelDir, viewsFilePath, workspaceFilePath } from "tome-db/content";
import { defaultTestWorkspaceFile } from "tome-db/content/test-helpers";

describe("views API", () => {
  test("POST and PATCH section tabs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-views-api-"));
    const contentDir = join(dir, "content");
    mkdirSync(contentModelDir(contentDir), { recursive: true });
    writeFileSync(
      workspaceFilePath(contentDir),
      serializeWorkspaceFile(defaultTestWorkspaceFile()),
      "utf-8",
    );
    const nodeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    writeFileSync(
      viewsFilePath(contentDir),
      serializeViewsFile({
        version: VIEWS_FILE_VERSION,
        nodes: {
          [nodeId]: {
            sections: {
              items: {
                tabs: {
                  kind: "custom",
                  definitions: [
                    { id: "all", name: "All", sorts: [{ column: "name", direction: "asc" }] },
                  ],
                },
              },
            },
          },
        },
      }),
    );

    const handler = createApiHandler(join(dir, "test.sqlite"), undefined, contentDir);

    const created = await handler(
      new Request(`http://127.0.0.1/api/views/nodes/${nodeId}/sections/items/tabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Extra" }),
      }),
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { tab: { id: string; name: string } };
    expect(createdBody.tab.name).toBe("Extra");

    const updated = await handler(
      new Request(
        `http://127.0.0.1/api/views/nodes/${nodeId}/sections/items/tabs/${createdBody.tab.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sorts: [{ column: "name", direction: "desc" }] }),
        },
      ),
    );
    expect(updated.status).toBe(200);

    const sectionPatch = await handler(
      new Request(`http://127.0.0.1/api/views/nodes/${nodeId}/sections/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnOrder: ["name", "priority"] }),
      }),
    );
    expect(sectionPatch.status).toBe(200);
    const sectionBody = (await sectionPatch.json()) as { columnOrder: string[] };
    expect(sectionBody.columnOrder).toEqual(["name", "priority"]);

    const tabOrderPatch = await handler(
      new Request(`http://127.0.0.1/api/views/nodes/${nodeId}/sections/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabOrder: [createdBody.tab.id, "all"] }),
      }),
    );
    expect(tabOrderPatch.status).toBe(200);
    const tabOrderBody = (await tabOrderPatch.json()) as {
      tabOrder: Array<{ id: string; name: string }>;
    };
    expect(tabOrderBody.tabOrder.map((tab) => tab.id)).toEqual([createdBody.tab.id, "all"]);

    rmSync(dir, { recursive: true, force: true });
  });
});
