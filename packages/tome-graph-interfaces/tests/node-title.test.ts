import { describe, expect, test } from "bun:test";
import { isPersistableNodeTitle, NON_PERSISTABLE_NODE_TITLE } from "../src/node-title";

describe("isPersistableNodeTitle", () => {
  test("accepts non-empty titles other than Untitled", () => {
    expect(isPersistableNodeTitle("Hello")).toBe(true);
    expect(isPersistableNodeTitle("  Hello  ")).toBe(true);
  });

  test("rejects empty and Untitled", () => {
    expect(isPersistableNodeTitle("")).toBe(false);
    expect(isPersistableNodeTitle("   ")).toBe(false);
    expect(isPersistableNodeTitle(NON_PERSISTABLE_NODE_TITLE)).toBe(false);
  });
});
