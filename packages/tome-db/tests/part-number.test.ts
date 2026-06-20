import { describe, expect, test } from "bun:test";
import { partNumberFromTitle } from "../src/part-number";

describe("partNumberFromTitle", () => {
  test("maps Prelude to 0", () => {
    expect(partNumberFromTitle("Prelude")).toBe(0);
    expect(partNumberFromTitle("prelude")).toBe(0);
  });

  test("maps Part N titles to N", () => {
    expect(partNumberFromTitle("Part 1")).toBe(1);
    expect(partNumberFromTitle("Part 3 - The Asylum")).toBe(3);
    expect(partNumberFromTitle("Part 0 - Prelude")).toBe(0);
  });

  test("returns null when title has no part number", () => {
    expect(partNumberFromTitle("Interlude")).toBeNull();
    expect(partNumberFromTitle("")).toBeNull();
  });
});
