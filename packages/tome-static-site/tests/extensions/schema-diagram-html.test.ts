import { describe, expect, test } from "bun:test";
import { register } from "tome-schema-diagram/html";
import { HtmlPageBlockHostImpl } from "../../src/extensions/html-host";
import { createPageBlockHtmlContext, renderNodeBodyHtml } from "../../src/lib/page-block-html";
import { createNodeUrlResolver } from "../../src/lib/node-urls";
import type { ResolvedExtensionComponent } from "tome-db";
import { serializePageBlock } from "tome-interfaces/page-block";

const NODE_ID = "aabbccdd112233445566778899aabbcc";
const SCENE_TYPE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FEATURE_TYPE_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const urls = createNodeUrlResolver({
  pathById: { [NODE_ID]: NODE_ID },
  base: "/",
});

describe("schema diagram static html", () => {
  test("renders inline SVG when schemaQuery is provided", async () => {
    const host = new HtmlPageBlockHostImpl();
    register(host);

    const components: ResolvedExtensionComponent[] = [
      {
        id: "schema-diagram.block",
        extensionId: "schema-diagram",
        implementationId: "schema-diagram",
        label: "Schema diagram",
        kind: "page-block",
        params: {},
        extension: { id: "schema-diagram" },
      },
    ];

    const ctx = createPageBlockHtmlContext(
      host,
      components,
      NODE_ID,
      "/content",
      undefined,
      undefined,
      {
        listTypeTables: async () => [
          { id: SCENE_TYPE_ID, title: "Scene" },
          { id: FEATURE_TYPE_ID, title: "Feature" },
        ],
        listRelationshipRules: async () => [],
        listRelationColumnEdges: async () => [
          {
            id: `${SCENE_TYPE_ID}:features`,
            sourceTypeId: SCENE_TYPE_ID,
            targetTypeId: FEATURE_TYPE_ID,
            label: "features",
          },
        ],
      },
    );

    const body = serializePageBlock("schema-diagram.block", {});
    const html = await renderNodeBodyHtml(body, "Title", urls, () => "Untitled", ctx);
    expect(html).toContain('class="tome-schema-diagram"');
    expect(html).toContain("<svg");
    expect(html).toContain("Scene");
    expect(html).toContain("features");
    expect(html).not.toContain("open in the editor");
  });
});
