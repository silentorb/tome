import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiHandler } from "../../src/api/server";
import { serializeViewsFile, serializeWorkspaceFile, VIEWS_FILE_VERSION } from "tome-db";
import { contentModelDir, viewsFilePath, workspaceFilePath } from "tome-db/content";
import { defaultTestWorkspaceFile } from "tome-db/content/test-helpers";

describe("views API", () => {
  test("POST and PATCH relationship views", async () => {
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
        views: [
          {
            id: "all",
            nodeId,
            relationshipType: "members",
            name: "All",
            sorts: [{ column: "name", direction: "asc" }],
          },
        ],
      }),
    );

    const handler = createApiHandler(join(dir, "test.sqlite"), undefined, contentDir);
    const base = `/api/views/nodes/${nodeId}/relationships/members`;

    const created = await handler(
      new Request(`http://127.0.0.1${base}/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Extra" }),
      }),
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { view: { id: string; name: string } };
    expect(createdBody.view.name).toBe("Extra");

    const updated = await handler(
      new Request(`http://127.0.0.1${base}/views/${createdBody.view.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sorts: [{ column: "name", direction: "desc" }] }),
      }),
    );
    expect(updated.status).toBe(200);

    const propertiesPatch = await handler(
      new Request(`http://127.0.0.1${base}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: { columnOrder: ["name", "priority"] } }),
      }),
    );
    expect(propertiesPatch.status).toBe(200);
    const propertiesBody = (await propertiesPatch.json()) as {
      properties: { columnOrder: string[] };
    };
    expect(propertiesBody.properties.columnOrder).toEqual(["name", "priority"]);

    const viewOrderPatch = await handler(
      new Request(`http://127.0.0.1${base}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewOrder: [createdBody.view.id, "all"] }),
      }),
    );
    expect(viewOrderPatch.status).toBe(200);
    const viewOrderBody = (await viewOrderPatch.json()) as {
      views: Array<{ id: string; name: string }>;
    };
    expect(viewOrderBody.views.map((view) => view.id)).toEqual([createdBody.view.id, "all"]);

    const hiddenPatch = await handler(
      new Request(`http://127.0.0.1${base}/views/all`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenColumns: ["priority"] }),
      }),
    );
    expect(hiddenPatch.status).toBe(200);
    const hiddenBody = (await hiddenPatch.json()) as {
      view: { hiddenColumns?: string[] };
    };
    expect(hiddenBody.view.hiddenColumns).toEqual(["priority"]);

    const extraHiddenPatch = await handler(
      new Request(`http://127.0.0.1${base}/views/${createdBody.view.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenColumns: ["status"] }),
      }),
    );
    expect(extraHiddenPatch.status).toBe(200);
    const extraHiddenBody = (await extraHiddenPatch.json()) as {
      view: { hiddenColumns?: string[] };
    };
    expect(extraHiddenBody.view.hiddenColumns).toEqual(["status"]);

    rmSync(dir, { recursive: true, force: true });
  });
});
