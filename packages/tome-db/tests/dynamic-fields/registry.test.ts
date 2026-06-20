import { describe, expect, test } from "bun:test";
import { isFieldVisibleForView } from "../../src/dynamic-fields/registry";

describe("dynamic-fields registry", () => {
  test("isFieldVisibleForView treats empty viewNames as all views", () => {
    expect(isFieldVisibleForView([], "Weighted")).toBe(true);
    expect(isFieldVisibleForView([], "Wonder")).toBe(true);
  });

  test("isFieldVisibleForView respects explicit view bindings", () => {
    expect(isFieldVisibleForView(["Weighted"], "Weighted")).toBe(true);
    expect(isFieldVisibleForView(["Weighted"], "Wonder")).toBe(false);
  });
});
