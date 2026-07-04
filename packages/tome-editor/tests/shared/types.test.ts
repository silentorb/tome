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
    const id = "00000000000000000000000014";
    expect(nodeIdFromHref(tomeHref(id))).toBe(id);
  });

  test("node markdown href for stored content", () => {
    const id = "00000000000000000000000014";
    expect(nodeMarkdownHref(id)).toBe(`./${id}.md`);
    expect(formatNodeMarkdownLink("Marloth", id)).toBe(`[Marloth](./${id}.md)`);
  });

  test("node uri parsing", () => {
    const id = "00000000000000000000000014";
    expect(nodeIdFromUri(`marloth://node/${id}`)).toBe(id);
  });

  test("resolves relative sibling paths", () => {
    const id = "00000000000000000000000014";
    expect(resolveLinkTarget(`./${id}.md`)).toBe(id);
  });

  test("builds standalone browser node urls", () => {
    const id = "00000000000000000000000014";
    expect(standaloneNodeUrl(id, "http://127.0.0.1:5173/?view=overview")).toBe(
      "http://127.0.0.1:5173/?node=00000000000000000000000014",
    );
    expect(standaloneNodeUrl(id, "http://127.0.0.1:5173/")).toBe(
      "http://127.0.0.1:5173/?node=00000000000000000000000014",
    );
  });
});
