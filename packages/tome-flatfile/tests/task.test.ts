import { describe, expect, test } from "bun:test";
import {
  extractLeadingTaskMarker,
  hasLeadingTaskMarker,
  taskMarkerPrefix,
} from "../src/task";

describe("task", () => {
  test("hasLeadingTaskMarker detects checkbox leads", () => {
    expect(hasLeadingTaskMarker("[ ] Buy milk")).toBe(true);
    expect(hasLeadingTaskMarker("[x] Done")).toBe(true);
    expect(hasLeadingTaskMarker("[X] Done")).toBe(true);
    expect(hasLeadingTaskMarker("  [ ] indented")).toBe(true);
    expect(hasLeadingTaskMarker("[] empty brackets")).toBe(false);
    expect(hasLeadingTaskMarker("Plain quote")).toBe(false);
    expect(hasLeadingTaskMarker("💡 callout")).toBe(false);
  });

  test("extractLeadingTaskMarker returns checked and raw prefix", () => {
    expect(extractLeadingTaskMarker("[ ] Note")).toEqual({
      checked: false,
      raw: "[ ] ",
    });
    expect(extractLeadingTaskMarker("[x] Done")).toEqual({
      checked: true,
      raw: "[x] ",
    });
    expect(extractLeadingTaskMarker("[X] Done")).toEqual({
      checked: true,
      raw: "[X] ",
    });
    expect(extractLeadingTaskMarker("  [ ]  spaced")).toEqual({
      checked: false,
      raw: "[ ]  ",
    });
    expect(extractLeadingTaskMarker("no marker")).toBeNull();
  });

  test("taskMarkerPrefix ends with space", () => {
    expect(taskMarkerPrefix(false)).toBe("[ ] ");
    expect(taskMarkerPrefix(true)).toBe("[x] ");
  });
});
