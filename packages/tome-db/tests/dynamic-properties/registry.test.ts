import { describe, expect, test } from "bun:test";
import { isPropertyVisibleForView } from "../../src/dynamic-properties/registry";

describe("dynamic property view bindings", () => {
  test("isPropertyVisibleForView treats empty viewNames as all views", () => {
    expect(isPropertyVisibleForView([], "Weighted")).toBe(true);
    expect(isPropertyVisibleForView([], "Wonder")).toBe(true);
  });

  test("isPropertyVisibleForView respects explicit view bindings", () => {
    expect(isPropertyVisibleForView(["Weighted"], "Weighted")).toBe(true);
    expect(isPropertyVisibleForView(["Weighted"], "Wonder")).toBe(false);
  });
});
