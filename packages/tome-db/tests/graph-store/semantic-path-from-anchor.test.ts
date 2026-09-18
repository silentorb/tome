import { describe, expect, test } from "bun:test";
import {
  createTomePathOntology,
} from "tome-imp-sql";
import type { AssociationsFile, TableSchemasFile } from "tome-flatfile";
import { semanticPathFromAnchorGraph } from "../../src/graph-store/standard-graphs";

const FEATURE_TYPE = "01KWN86X6MFZQAJ1V36T9592A9";
const DEPENDS_ASSOC = "01KXBNPNJDENZ9BXN5BYZ7JKPD";
const ANCHOR = "01KWN86X6MFZQAJ1V36T9592ZZ";

describe("semanticPathFromAnchorGraph", () => {
  test("filters to anchor then binds semantic path", () => {
    const associations: AssociationsFile = {
      version: 1,
      associations: {
        [DEPENDS_ASSOC]: {
          perspectives: ["Dependents", "Dependencies"],
          endpoints: {
            0: { typeId: FEATURE_TYPE },
            1: { typeId: FEATURE_TYPE },
          },
        },
      },
    };
    const tableSchemas: TableSchemasFile = {
      version: 1,
      tables: {
        [FEATURE_TYPE]: {
          columns: [
            {
              key: "dependencies",
              name: "Dependencies",
              type: "relation",
              association: DEPENDS_ASSOC,
              endpoint: 1,
            },
          ],
        },
      },
    };
    const ontology = createTomePathOntology(associations, tableSchemas);
    const graph = semanticPathFromAnchorGraph(ANCHOR, ["dependencies", "title"], {
      ontology,
      startType: FEATURE_TYPE,
    });

    expect(graph.nodes.filter?.type).toBe("filter");
    const traverse = Object.values(graph.nodes).find((n) => n.type === "traverse");
    expect(traverse?.inputs.association).toBe(DEPENDS_ASSOC);
    expect(traverse?.inputs.direction).toBe(1);
    const project = Object.values(graph.nodes).find((n) => n.type === "project");
    expect(project?.inputs.columns).toBe("title");
  });
});
