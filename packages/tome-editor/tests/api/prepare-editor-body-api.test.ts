import { describe, expect, test, afterAll } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializePageBlock } from "tome-interfaces/page-block";
import { invalidateExtensionsCache } from "tome-db";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestWorkspace,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { contentModelDir } from "tome-db/content";
import { createTestApiFromContent } from "./test-api-setup";

const nodeId = "c3333333333333333333333333333333";

describe("prepare-editor-body API", () => {
  const fixture = createTestContentFixture("tome-prepare-body-api-");

  seedTestWorkspace(fixture);
  seedTestNode(fixture, {
    id: TEST_HOME_NODE_ID,
    properties: { title: "Home" },
  });
  seedTestNode(fixture, {
    id: nodeId,
    properties: { title: "Page with block" },
    body: serializePageBlock("fixture.demo", { text: "Hello" }),
  });

  writeFileSync(
    join(contentModelDir(fixture.ctx.store.contentDir), "extensions.json"),
    JSON.stringify(
      {
        version: 1,
        extensions: [
          {
            id: "fixture",
            enabled: true,
            htmlModule: "tome-extension-fixture/html",
          },
        ],
        components: [
          {
            id: "fixture.demo",
            extensionId: "fixture",
            kind: "page-block",
            implementationId: "fixture-demo",
            label: "Fixture block",
            enabled: true,
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  invalidateExtensionsCache();
  const api = createTestApiFromContent(fixture);

  test("POST /api/nodes/:id/prepare-editor-body expands page blocks", async () => {
    const body = serializePageBlock("fixture.demo", { text: "Hello" });
    const res = await api.handler(
      new Request(`http://127.0.0.1/api/nodes/${nodeId}/prepare-editor-body`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: body }),
      }),
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { markdown: string };
    expect(payload.markdown).toContain("<!-- tome-page-block ");
    expect(payload.markdown).toContain("tome-page-block-fixture");
    expect(payload.markdown).toContain("Hello");
    expect(payload.markdown).not.toContain("```tome-block");
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
