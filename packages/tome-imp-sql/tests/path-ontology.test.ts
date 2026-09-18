import { describe, expect, test } from "bun:test";
import type { AssociationsFile, TableSchemasFile } from "tome-flatfile";
import {
  bindTomeSemanticPath,
  createTomePathOntology,
} from "../src/path-ontology";

const FEATURE_TYPE = "01KWN86X6MFZQAJ1V36T9592A9";
const DEPENDS_ASSOC = "01KXBNPNJDENZ9BXN5BYZ7JKPD";

function fixtureAssociations(): AssociationsFile {
  return {
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
}

function fixtureTableSchemas(): TableSchemasFile {
  return {
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
          {
            key: "dependents",
            name: "Dependents",
            type: "relation",
            association: DEPENDS_ASSOC,
            endpoint: 0,
          },
          {
            key: "status",
            name: "Status",
            type: "select",
          },
        ],
      },
    },
  };
}

describe("createTomePathOntology", () => {
  test("binds relation and property tokens from table-schemas", () => {
    const ontology = createTomePathOntology(fixtureAssociations(), fixtureTableSchemas());
    expect(ontology.resolve(FEATURE_TYPE, "dependencies")).toEqual({
      kind: "relationship",
      association: DEPENDS_ASSOC,
      direction: 1,
      nextType: FEATURE_TYPE,
    });
    expect(ontology.resolve(FEATURE_TYPE, "title")).toEqual({
      kind: "property",
      name: "title",
    });
    expect(ontology.resolve(FEATURE_TYPE, "status")).toEqual({
      kind: "property",
      name: "status",
    });
  });

  test("rejects property/relationship token collisions", () => {
    const schemas: TableSchemasFile = {
      version: 1,
      tables: {
        [FEATURE_TYPE]: {
          columns: [
            {
              key: "title",
              name: "Title conflict",
              type: "relation",
              association: DEPENDS_ASSOC,
              endpoint: 0,
            },
          ],
        },
      },
    };
    expect(() => createTomePathOntology(fixtureAssociations(), schemas)).toThrow(
      /integrity/,
    );
  });

  test("rejects unknown tokens at resolve time", () => {
    const ontology = createTomePathOntology(fixtureAssociations(), fixtureTableSchemas());
    expect(() => ontology.resolve(FEATURE_TYPE, "nope")).toThrow(/unknown token/);
  });
});

describe("bindTomeSemanticPath", () => {
  test("desugars dependencies.title to traverse then project", () => {
    const ontology = createTomePathOntology(fixtureAssociations(), fixtureTableSchemas());
    const bound = bindTomeSemanticPath(["dependencies", "title"], {
      ontology,
      startType: FEATURE_TYPE,
      prefix: "p",
      source: { node: "input", port: "value" },
    });
    expect(bound.steps).toEqual([
      {
        kind: "edge",
        association: DEPENDS_ASSOC,
        direction: 1,
      },
      { kind: "field", name: "title" },
    ]);
    const traverse = Object.values(bound.nodes).find((n) => n.type === "traverse");
    const project = Object.values(bound.nodes).find((n) => n.type === "project");
    expect(traverse).toBeDefined();
    expect(project).toBeDefined();
    expect(project?.inputs.columns).toBe("title");
  });
});
