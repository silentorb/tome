import { describe, expect, test } from "bun:test";
import { mergeDynamicColumnDefs } from "../src/database-column-defs";
import type { DatabaseColumnDef } from "../src/database-view";

describe("database-column-defs", () => {
  test("mergeDynamicColumnDefs replaces stored defs and appends new dynamic columns", () => {
    const stored: DatabaseColumnDef[] = [
      { key: "priority", name: "Priority", type: "enum" },
      { key: "weighted_use", name: "Weighted Use", type: "number" },
    ];
    const dynamic: DatabaseColumnDef[] = [
      { key: "weighted_use", name: "Weighted Use", type: "number", source: "dynamic" },
      { key: "wonder", name: "Wonder", type: "number", source: "dynamic" },
    ];
    const merged = mergeDynamicColumnDefs(stored, dynamic, new Set());
    expect(merged.map((col) => col.key)).toEqual(["priority", "weighted_use", "wonder"]);
    expect(merged.find((col) => col.key === "weighted_use")?.source).toBe("dynamic");
  });

  test("mergeDynamicColumnDefs hides legacy keys", () => {
    const stored: DatabaseColumnDef[] = [
      { key: "twold_scene_count", name: "TWOLD Scene count", type: "number" },
      { key: "priority", name: "Priority", type: "enum" },
    ];
    const dynamic: DatabaseColumnDef[] = [
      { key: "scene_count__book1", name: "Book Scene count", type: "number", source: "dynamic" },
    ];
    const merged = mergeDynamicColumnDefs(stored, dynamic, new Set(["twold_scene_count"]));
    expect(merged.map((col) => col.key)).toEqual(["priority", "scene_count__book1"]);
  });
});
