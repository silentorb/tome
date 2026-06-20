import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { IS_A_TYPE, typeTableMarkerProperties } from "tome-db";
import { openContentGraph } from "tome-db/content";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestTableSchema,
} from "tome-db/content/test-helpers";
import { createTestApiFromContent } from "./test-api-setup";

describe("database view API", () => {
  const fixture = createTestContentFixture("tome-editor-db-view-");
  const databaseId = "dddddddddddddddddddddddddddddddd";
  const nodeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  seedTestNode(fixture, { id: databaseId, properties: typeTableMarkerProperties("Features") });
  seedTestNode(fixture, { id: nodeId, properties: { title: "Feature row" } });
  seedTestRelationships(fixture, [
    { source: nodeId, target: databaseId, type: IS_A_TYPE, properties: { priority: "High" } },
  ]);

  const api = createTestApiFromContent(fixture);

  test("GET /api/databases/:id returns database view detail", async () => {
    const res = await api.handler(new Request(`http://127.0.0.1/api/databases/${databaseId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { databaseView: { rows: { name: string }[] } };
    expect(body.databaseView.rows[0]?.name).toBe("Feature row");
  });

  test("GET /api/nodes/:id embeds databaseView on type-table pages", async () => {
    const res = await api.handler(new Request(`http://127.0.0.1/api/nodes/${databaseId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      node: { sections: Array<{ type: string; databaseView?: { title: string } }> };
    };
    const section = body.node.sections.find((entry) => entry.type === "database");
    expect(section?.databaseView?.title).toBe("Features");
  });

  test("POST /api/databases/:id/columns adds column to schema", async () => {
    const dbWithSchema = "77777777777777777777777777777777";
    seedTestTableSchema(fixture, dbWithSchema, []);
    seedTestNode(fixture, {
      id: dbWithSchema,
      properties: typeTableMarkerProperties("Ideas"),
    });
    const apiCtx = openContentGraph(
      fixture.ctx.store.contentDir,
      join(fixture.tempDir, "api.sqlite"),
    );
    apiCtx.sync.fullRebuild();
    apiCtx.db.close();

    const createRes = await api.handler(
      new Request(`http://127.0.0.1/api/databases/${dbWithSchema}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Summary", type: "text" }),
      }),
    );
    expect(createRes.status).toBe(200);
    const createBody = (await createRes.json()) as { column: { key: string } };
    expect(createBody.column.key).toBe("summary");

    const viewRes = await api.handler(new Request(`http://127.0.0.1/api/databases/${dbWithSchema}`));
    const viewBody = (await viewRes.json()) as { databaseView: { columns: string[] } };
    expect(viewBody.databaseView.columns).toContain("summary");
  });

  test("PATCH /api/databases/:id/columns/:key updates column metadata", async () => {
    const dbWithSchema = "88888888888888888888888888888888";
    seedTestTableSchema(fixture, dbWithSchema, [
      { key: "notes", name: "Notes", type: "text" },
    ]);
    seedTestNode(fixture, {
      id: dbWithSchema,
      properties: typeTableMarkerProperties("Notes DB"),
    });
    const apiCtx = openContentGraph(
      fixture.ctx.store.contentDir,
      join(fixture.tempDir, "api.sqlite"),
    );
    apiCtx.sync.fullRebuild();
    apiCtx.db.close();

    const patchRes = await api.handler(
      new Request(`http://127.0.0.1/api/databases/${dbWithSchema}/columns/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Description", newKey: "description" }),
      }),
    );
    expect(patchRes.status).toBe(200);
    const patchBody = (await patchRes.json()) as { column: { key: string; name: string } };
    expect(patchBody.column).toMatchObject({ key: "description", name: "Description" });
  });

  test("DELETE /api/databases/:id/columns/:key removes column from schema and rows", async () => {
    const dbWithSchema = "55555555555555555555555555555555";
    const rowId = "66666666666666666666666666666666";
    seedTestTableSchema(fixture, dbWithSchema, [
      { key: "status", name: "Status", type: "select" },
    ]);
    seedTestNode(fixture, {
      id: dbWithSchema,
      properties: typeTableMarkerProperties("Tasks"),
    });
    seedTestNode(fixture, { id: rowId, properties: { title: "Task row" } });
    seedTestRelationships(fixture, [
      { source: rowId, target: dbWithSchema, type: IS_A_TYPE, properties: { status: "Open" } },
    ]);
    const apiCtx = openContentGraph(
      fixture.ctx.store.contentDir,
      join(fixture.tempDir, "api.sqlite"),
    );
    apiCtx.sync.fullRebuild();
    apiCtx.db.close();

    const deleteRes = await api.handler(
      new Request(`http://127.0.0.1/api/databases/${dbWithSchema}/columns/status`, {
        method: "DELETE",
      }),
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = (await deleteRes.json()) as { rowsAffected: number };
    expect(deleteBody.rowsAffected).toBe(1);

    const viewRes = await api.handler(new Request(`http://127.0.0.1/api/databases/${dbWithSchema}`));
    const viewBody = (await viewRes.json()) as { databaseView: { columns: string[] } };
    expect(viewBody.databaseView.columns).not.toContain("status");
  });

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });
});
