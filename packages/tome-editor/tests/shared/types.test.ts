import { describe, expect, test } from "bun:test";
import {
  formatNodeMarkdownLink,
  tomeHref,
  nodeIdFromHref,
  nodeIdFromUri,
  nodeMarkdownHref,
  resolveLinkTarget,
  standaloneNodeUrl,
} from "../../src/shared/types";

describe("link helpers", () => {
  test("tome href round-trip", () => {
    const id = "72b6fb455b824b78962b0e509cc091c9";
    expect(nodeIdFromHref(tomeHref(id))).toBe(id);
  });

  test("node markdown href for stored content", () => {
    const id = "72b6fb455b824b78962b0e509cc091c9";
    expect(nodeMarkdownHref(id)).toBe(`./${id}.md`);
    expect(formatNodeMarkdownLink("Marloth", id)).toBe(`[Marloth](./${id}.md)`);
  });

  test("node uri parsing", () => {
    const id = "72b6fb455b824b78962b0e509cc091c9";
    expect(nodeIdFromUri(`marloth://node/${id}`)).toBe(id);
  });

  test("resolves legacy notion export paths", () => {
    const href = "Marloth/TWOLD%20design%2013458e628ba28073850dea0edb9acde1.md";
    expect(resolveLinkTarget(href)).toBe("13458e628ba28073850dea0edb9acde1");
  });

  test("resolves relative sibling paths", () => {
    const id = "72b6fb455b824b78962b0e509cc091c9";
    expect(resolveLinkTarget(`./${id}.md`)).toBe(id);
  });

  test("builds standalone browser node urls", () => {
    const id = "72b6fb455b824b78962b0e509cc091c9";
    expect(standaloneNodeUrl(id, "http://127.0.0.1:5173/?view=overview")).toBe(
      "http://127.0.0.1:5173/?node=72b6fb455b824b78962b0e509cc091c9",
    );
    expect(standaloneNodeUrl(id, "http://127.0.0.1:5173/")).toBe(
      "http://127.0.0.1:5173/?node=72b6fb455b824b78962b0e509cc091c9",
    );
  });
});
