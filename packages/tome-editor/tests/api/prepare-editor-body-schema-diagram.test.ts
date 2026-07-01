import { describe, expect, test, afterAll } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializePageBlock } from "tome-interfaces/page-block";
import {
  invalidateExtensionsCache,
  invalidateSchemaCache,
  invalidateTableSchemasCache,
  serializeSchemaFile,
} from "tome-db";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestWorkspace,
  TEST_HOME_NODE_ID,
} from "tome-db/content/test-helpers";
import { contentModelDir, schemaFilePath } from "tome-db/content";
import { createTestApiFromContent } from "./test-api-setup";

const nodeId = "d4444444444444444444444444444444";
const sceneTypeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const featureTypeId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("prepare-editor-body API — schema diagram", () => {
  const fixture = createTestContentFixture("tome-prepare-schema-diagram-");

  seedTestWorkspace(fixture);
  seedTestNode(fixture, {
    id: TEST_HOME_NODE_ID,
    properties: { title: "Home" },
  });
  seedTestNode(fixture, {
    id: sceneTypeId,
    properties: { title: "Scene" },
  });
  seedTestNode(fixture, {
    id: featureTypeId,
    properties: { title: "Feature" },
  });
  seedTestNode(fixture, {
    id: nodeId,
    properties: { title: "Schema page" },
    body: serializePageBlock("schema-diagram.block", {}),
  });

  const modelDir = contentModelDir(fixture.ctx.store.contentDir);
  writeFileSync(
    join(modelDir, "extensions.json"),
    JSON.stringify(
      {
        version: 1,
        extensions: [
          {
            id: "schema-diagram",
            enabled: true,
            htmlModule: "tome-schema-diagram/html",
          },
        ],
        components: [
          {
            id: "schema-diagram.block",
            extensionId: "schema-diagram",
            kind: "page-block",
            implementationId: "schema-diagram",
            label: "Schema diagram",
            enabled: true,
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    join(modelDir, "table-schemas.json"),
    JSON.stringify(
      {
        version: 1,
        tables: {
          [sceneTypeId]: {
            columns: [
              {
                key: "features",
                name: "Features",
                type: "relation",
                targetTypeId: featureTypeId,
                perspective: "features",
              },
            ],
          },
          [featureTypeId]: { columns: [] },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  invalidateTableSchemasCache();

  writeFileSync(
    schemaFilePath(fixture.ctx.store.contentDir),
    serializeSchemaFile({
      version: 1,
      relationshipRules: [],
      enums: {},
    }),
    "utf-8",
  );
  invalidateSchemaCache();

  invalidateExtensionsCache();
  const api = createTestApiFromContent(fixture);

  test("POST /api/nodes/:id/prepare-editor-body expands schema diagram block", async () => {
    const body = serializePageBlock("schema-diagram.block", {});
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
    expect(payload.markdown).toContain('class="tome-schema-diagram"');
    expect(payload.markdown).toContain('<pre class="mermaid">');
    expect(payload.markdown).toContain("erDiagram");
    expect(payload.markdown).toContain('Scene ||--o{ Feature : "features"');
    expect(payload.markdown).not.toContain("```tome-block");
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
