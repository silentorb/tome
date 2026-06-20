import { describe, expect, test } from "bun:test";
import {
  emptyOrderedAssociationsFile,
  ORDERED_ASSOCIATIONS_FILE_VERSION,
  parseOrderedAssociationsFile,
  serializeOrderedAssociationsFile,
} from "../../src/ordered-associations-config/ordered-associations-file";

const VALID_CONFIG = {
  id: "scenes-by-book",
  typeDatabaseId: "204dba198db74611b0b49a98dd53e8f5",
  membershipEdgeType: "is_a",
  orderProperty: "order",
  scopeCompositeType: "scenes_product",
  groupCompositeType: "scenes_part",
  partProductCompositeType: "products_parts_database",
  groupTypeDatabaseId: "5e45eefc69a14f45b988ad1f3c9d1ef5",
  unassignedGroupTitle: "Unassigned",
  columnViewName: "TWOLD Active",
  excludedColumnKeys: ["order", "product", "part", "status"],
  partNumberProperty: "number",
};

describe("parseOrderedAssociationsFile", () => {
  test("parses valid file", () => {
    const raw = serializeOrderedAssociationsFile({
      version: ORDERED_ASSOCIATIONS_FILE_VERSION,
      configs: [VALID_CONFIG],
    });
    const file = parseOrderedAssociationsFile(raw);
    expect(file.version).toBe(1);
    expect(file.configs).toHaveLength(1);
    expect(file.configs[0]?.id).toBe("scenes-by-book");
  });

  test("emptyOrderedAssociationsFile has version and empty configs", () => {
    const file = emptyOrderedAssociationsFile();
    expect(file.version).toBe(ORDERED_ASSOCIATIONS_FILE_VERSION);
    expect(file.configs).toEqual([]);
  });

  test("rejects unsupported version", () => {
    const raw = JSON.stringify({ version: 99, configs: [] });
    expect(() => parseOrderedAssociationsFile(raw)).toThrow(/unsupported version/);
  });

  test("rejects duplicate config ids", () => {
    const raw = JSON.stringify({
      version: 1,
      configs: [VALID_CONFIG, { ...VALID_CONFIG }],
    });
    expect(() => parseOrderedAssociationsFile(raw)).toThrow(/duplicate config id/);
  });

  test("rejects invalid typeDatabaseId", () => {
    const raw = JSON.stringify({
      version: 1,
      configs: [{ ...VALID_CONFIG, typeDatabaseId: "not-a-node-id" }],
    });
    expect(() => parseOrderedAssociationsFile(raw)).toThrow(/typeDatabaseId/);
  });

  test("rejects missing required string field", () => {
    const { id: _id, ...incomplete } = VALID_CONFIG;
    const raw = JSON.stringify({ version: 1, configs: [incomplete] });
    expect(() => parseOrderedAssociationsFile(raw)).toThrow(/\.id/);
  });
});
