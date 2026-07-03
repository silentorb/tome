import { describe, expect, test } from "bun:test";
import { normalizeHex32Id } from "../src/hex-ids";

describe("normalizeHex32Id", () => {
  test("strips dashes from UUID", () => {
    expect(normalizeHex32Id("df096ab2-6e83-47e6-992e-95698345aad0")).toBe(
      "df096ab26e8347e6992e95698345aad0",
    );
  });

  test("accepts compact hex", () => {
    expect(normalizeHex32Id("df096ab26e8347e6992e95698345aad0")).toBe(
      "df096ab26e8347e6992e95698345aad0",
    );
  });

  test("returns null for invalid id", () => {
    expect(normalizeHex32Id("not-an-id")).toBeNull();
  });
});
