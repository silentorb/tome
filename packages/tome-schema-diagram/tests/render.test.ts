import { describe, expect, test } from "bun:test";
import { parseSchemaDiagramConfig } from "../src/config";
import {
  renderSchemaDiagramDeferred,
  renderSchemaDiagramEditorShell,
} from "../src/render";

describe("schema diagram render", () => {
  test("static mode placeholder", () => {
    const html = renderSchemaDiagramDeferred("Schema diagram");
    expect(html).toContain("tome-schema-diagram-deferred");
    expect(html).toContain("open in the editor");
  });

  test("editor shell emits mermaid source", async () => {
    const html = await renderSchemaDiagramEditorShell(
      {
        listTypeTables: () => [{ id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Scene" }],
        listRelationshipRules: () => [],
        listRelationColumnEdges: () => [],
      },
      {},
      "Schema diagram",
    );
    expect(html).toContain('class="tome-schema-diagram"');
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain("erDiagram");
    expect(html).toContain("Scene");
  });

  test("parseSchemaDiagramConfig defaults", () => {
    const config = parseSchemaDiagramConfig({});
    expect(config.typeIds).toBeNull();
    expect(config.relationshipTypes).toBeNull();
    expect(config.theme).toBe("default");
    expect(config.direction).toBe("TB");
  });
});
