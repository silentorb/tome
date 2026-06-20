import { describe, expect, test } from "bun:test";
import { normalizeNotionId } from "../src/notion-ids";

describe("normalizeNotionId", () => {
  test("strips dashes from UUID", () => {
    expect(normalizeNotionId("df096ab2-6e83-47e6-992e-95698345aad0")).toBe(
      "df096ab26e8347e6992e95698345aad0",
    );
  });

  test("accepts compact hex", () => {
    expect(normalizeNotionId("df096ab26e8347e6992e95698345aad0")).toBe(
      "df096ab26e8347e6992e95698345aad0",
    );
  });

  test("returns null for invalid id", () => {
    expect(normalizeNotionId("not-an-id")).toBeNull();
  });
});
