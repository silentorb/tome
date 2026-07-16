import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestApi } from "./test-api-setup";
import { serializeViewsFile, serializeWorkspaceFile, VIEWS_FILE_VERSION } from "tome-db";
import { contentModelDir, viewsFilePath, workspaceFilePath } from "tome-db/content";
import { defaultTestWorkspaceFile, TEST_MEMBER_OF_ASSOCIATION_ID } from "tome-db/content/test-helpers";

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
    const nodeId = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
    writeFileSync(
      viewsFilePath(contentDir),
      serializeViewsFile({
        version: VIEWS_FILE_VERSION,
        views: [
          {
            id: "all",
            nodeId,
            association: TEST_MEMBER_OF_ASSOCIATION_ID,
            name: "All",
            sorts: [{ column: "name", direction: "asc" }],
          },
        ],
      }),
    );

    const { handler } = createTestApi({ dbPath: join(dir, "test.sqlite"), contentDir });
    const base = `/api/views/nodes/${nodeId}/associations/${TEST_MEMBER_OF_ASSOCIATION_ID}`;

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
        body: JSON.stringify({ properties: ["name", "priority"] }),
      }),
    );
    expect(propertiesPatch.status).toBe(200);
    const propertiesBody = (await propertiesPatch.json()) as {
      properties: string[];
    };
    expect(propertiesBody.properties).toEqual(["name", "priority"]);

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

    const allPropertiesPatch = await handler(
      new Request(`http://127.0.0.1${base}/views/all`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: ["name"] }),
      }),
    );
    expect(allPropertiesPatch.status).toBe(200);
    const allPropertiesBody = (await allPropertiesPatch.json()) as {
      view: { properties?: string[] };
    };
    expect(allPropertiesBody.view.properties).toEqual(["name"]);

    const extraPropertiesPatch = await handler(
      new Request(`http://127.0.0.1${base}/views/${createdBody.view.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: ["status"] }),
      }),
    );
    expect(extraPropertiesPatch.status).toBe(200);
    const extraPropertiesBody = (await extraPropertiesPatch.json()) as {
      view: { properties?: string[] };
    };
    expect(extraPropertiesBody.view.properties).toEqual(["status"]);

    rmSync(dir, { recursive: true, force: true });
  });
});
