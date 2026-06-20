import { describe, expect, test } from "bun:test";
import { buildSearchMatchPreview } from "../src/search-match-preview";

function partTexts(preview: NonNullable<ReturnType<typeof buildSearchMatchPreview>>) {
  return preview.parts.map((p) => p.text).join("");
}

function highlightedText(preview: NonNullable<ReturnType<typeof buildSearchMatchPreview>>) {
  return preview.parts
    .filter((p) => p.highlight)
    .map((p) => p.text)
    .join("");
}

describe("buildSearchMatchPreview", () => {
  test("returns null when query is empty or not in body", () => {
    expect(buildSearchMatchPreview("hello world", "")).toBeNull();
    expect(buildSearchMatchPreview("hello world", "   ")).toBeNull();
    expect(buildSearchMatchPreview("hello world", "missing")).toBeNull();
  });

  test("highlights match with original casing", () => {
    const preview = buildSearchMatchPreview("Alpha BETA gamma", "beta");
    expect(preview).not.toBeNull();
    expect(highlightedText(preview!)).toBe("BETA");
  });

  test("match at start has suffix ellipsis when body is long", () => {
    const padding = "x".repeat(200);
    const body = `needle${padding}`;
    const preview = buildSearchMatchPreview(body, "needle");
    expect(preview).not.toBeNull();
    expect(partTexts(preview!)).toMatch(/^needle/);
    expect(partTexts(preview!)).toMatch(/…$/);
    expect(partTexts(preview!)).not.toMatch(/^…/);
  });

  test("match at end has prefix ellipsis when body is long", () => {
    const padding = "x".repeat(200);
    const body = `${padding}needle`;
    const preview = buildSearchMatchPreview(body, "needle");
    expect(preview).not.toBeNull();
    expect(partTexts(preview!)).toMatch(/needle$/);
    expect(partTexts(preview!)).toMatch(/^…/);
    expect(partTexts(preview!)).not.toMatch(/…$/);
  });

  test("match in middle shows context on both sides", () => {
    const before = "a".repeat(80);
    const after = "b".repeat(80);
    const body = `${before}TARGET${after}`;
    const preview = buildSearchMatchPreview(body, "TARGET");
    expect(preview).not.toBeNull();
    const text = partTexts(preview!);
    expect(text).toContain("TARGET");
    expect(text).toMatch(/^…/);
    expect(text).toMatch(/…$/);
    const targetPos = text.indexOf("TARGET");
    expect(targetPos).toBeGreaterThan(3);
    expect(targetPos + "TARGET".length).toBeLessThan(text.length - 3);
  });

  test("collapses whitespace including newlines", () => {
    const preview = buildSearchMatchPreview("line one\n\nline two TARGET here", "TARGET");
    expect(preview).not.toBeNull();
    expect(partTexts(preview!)).toContain("line one line two TARGET");
    expect(partTexts(preview!)).not.toContain("\n");
  });

  test("short body has no ellipsis", () => {
    const preview = buildSearchMatchPreview("find me here", "me");
    expect(preview).not.toBeNull();
    expect(partTexts(preview!)).toBe("find me here");
    expect(preview!.parts.some((p) => p.text === "…")).toBe(false);
  });
});
