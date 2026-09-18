import { describe, expect, test } from "bun:test";
import type { AssociationsFile, TableSchemasFile } from "tome-flatfile";
import {
  buildPathHopOptions,
  matchPathHopRelation,
} from "../src/path-hop-options";

const FEATURE_TYPE = "01KWN86X6MFZQAJ1V36T9592A9";
const DEPENDS_ASSOC = "01KXBNPNJDENZ9BXN5BYZ7JKPD";

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
        {
          key: "status",
          name: "Status",
          type: "select",
        },
      ],
    },
  },
};

describe("buildPathHopOptions", () => {
  test("lists relation tokens per type", () => {
    const options = buildPathHopOptions(associations, tableSchemas, {
      [FEATURE_TYPE]: "Feature",
    });
    expect(options.typeTables).toEqual([{ id: FEATURE_TYPE, title: "Feature" }]);
    expect(options.relationsByType[FEATURE_TYPE]).toEqual([
      {
        token: "dependencies",
        label: "Dependencies",
        association: DEPENDS_ASSOC,
        direction: 1,
      },
    ]);
  });

  test("matchPathHopRelation finds token from association+direction", () => {
    const options = buildPathHopOptions(associations, tableSchemas);
    expect(
      matchPathHopRelation(options, FEATURE_TYPE, DEPENDS_ASSOC, 1)?.token,
    ).toBe("dependencies");
    expect(matchPathHopRelation(options, FEATURE_TYPE, DEPENDS_ASSOC, 0)).toBeNull();
  });
});
