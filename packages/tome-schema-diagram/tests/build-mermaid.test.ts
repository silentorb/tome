import { describe, expect, test } from "bun:test";
import { buildErDiagramMermaid } from "../src/build-mermaid";
import { parseSchemaDiagramConfig } from "../src/config";

const SNAPSHOT = {
  typeTables: [
    { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "Scene" },
    { id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", title: "Feature" },
    { id: "cccccccccccccccccccccccccccccccc", title: "Inspiration" },
  ],
  relationshipRules: [
    {
      id: "scene-features",
      sourceTypeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      type: "includes",
      allowedTargetTypeIds: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    },
    {
      id: "feature-inspirations",
      sourceTypeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      type: "includes",
      allowedTargetTypeIds: ["cccccccccccccccccccccccccccccccc"],
    },
  ],
};

describe("buildErDiagramMermaid", () => {
  test("builds erDiagram with entities and labeled edges", () => {
    const config = parseSchemaDiagramConfig({});
    const result = buildErDiagramMermaid(SNAPSHOT, config);
    expect(result.entityCount).toBe(3);
    expect(result.edgeCount).toBe(2);
    expect(result.source).toContain("erDiagram");
    expect(result.source).toContain('Scene ||--o{ Feature : "includes"');
    expect(result.source).toContain('Feature ||--o{ Inspiration : "includes"');
    expect(result.source).toContain("string type");
  });

  test("filters by typeIds and relationshipTypes", () => {
    const config = parseSchemaDiagramConfig({
      typeIds: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
      relationshipTypes: ["includes"],
    });
    const result = buildErDiagramMermaid(SNAPSHOT, config);
    expect(result.entityCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(result.source).toContain("Scene");
    expect(result.source).not.toContain("Inspiration");
  });

  test("includes direction when configured", () => {
    const config = parseSchemaDiagramConfig({ direction: "LR" });
    const result = buildErDiagramMermaid(SNAPSHOT, config);
    expect(result.source).toContain("direction LR");
  });
});
