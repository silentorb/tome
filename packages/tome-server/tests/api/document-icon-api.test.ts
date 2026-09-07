import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, afterAll } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  TEST_ARCHIVE_NODE_ID,
} from "tome-db/content/test-helpers";
import {
  invalidateWorkspaceCache,
  loadWorkspaceFromContent,
  serializeWorkspaceFile,
  workspaceFilePath,
} from "tome-flatfile";
import { createTestApiFromContent } from "./test-api-setup";

describe("GET /api/workspace/document-icon", () => {
  const fixture = createTestContentFixture("tome-document-icon-api-");

  seedTestNode(fixture, {
    id: TEST_ARCHIVE_NODE_ID,
    properties: { title: "Archive hub" },
  });

  const brandingDir = join(fixture.ctx.store.contentDir, "model", "branding");
  mkdirSync(brandingDir, { recursive: true });
  const svgPath = join(brandingDir, "icon.svg");
  writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"></svg>', "utf-8");

  const workspace = loadWorkspaceFromContent(fixture.ctx.store.contentDir);
  writeFileSync(
    workspaceFilePath(fixture.ctx.store.contentDir),
    serializeWorkspaceFile({
      ...workspace,
      branding: {
        ...workspace.branding,
        defaultDocumentIcon: "T",
        documentIconImage: "model/branding/icon.svg",
      },
    }),
    "utf-8",
  );
  invalidateWorkspaceCache();

  const api = createTestApiFromContent(fixture);

  afterAll(() => {
    api.handler.close();
    destroyTestContentFixture(fixture);
  });

  test("serves configured SVG branding icon", async () => {
    const res = await api.handler(new Request("http://127.0.0.1/api/workspace/document-icon"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    const text = await res.text();
    expect(text).toContain("<svg");
  });

  test("rejects path escape outside model/", async () => {
    writeFileSync(
      workspaceFilePath(fixture.ctx.store.contentDir),
      serializeWorkspaceFile({
        ...loadWorkspaceFromContent(fixture.ctx.store.contentDir),
        branding: {
          documentIconImage: "model/../data/secret.png",
        },
      }),
      "utf-8",
    );
    invalidateWorkspaceCache();

    const res = await api.handler(new Request("http://127.0.0.1/api/workspace/document-icon"));
    expect(res.status).toBe(400);
  });

  test("rejects unsupported icon type", async () => {
    writeFileSync(
      workspaceFilePath(fixture.ctx.store.contentDir),
      serializeWorkspaceFile({
        ...loadWorkspaceFromContent(fixture.ctx.store.contentDir),
        branding: {
          documentIconImage: "model/branding/icon.ico",
        },
      }),
      "utf-8",
    );
    invalidateWorkspaceCache();

    const res = await api.handler(new Request("http://127.0.0.1/api/workspace/document-icon"));
    expect(res.status).toBe(400);
  });

  test("returns 404 when branding image is unset", async () => {
    writeFileSync(
      workspaceFilePath(fixture.ctx.store.contentDir),
      serializeWorkspaceFile({
        ...loadWorkspaceFromContent(fixture.ctx.store.contentDir),
        branding: {
          appTitle: "Tome",
        },
      }),
      "utf-8",
    );
    invalidateWorkspaceCache();

    const res = await api.handler(new Request("http://127.0.0.1/api/workspace/document-icon"));
    expect(res.status).toBe(404);
  });
});
