import { describe, expect, test } from "bun:test";
import { parseTomeCorporaEnv } from "../src/load-services";

describe("parseTomeCorporaEnv", () => {
  test("parses id=path pairs and readonly suffix", () => {
    const parsed = parseTomeCorporaEnv(
      "marloth=/workspaces/marloth-story/content,translucence=/workspaces/translucence/content:readonly",
    );
    expect(parsed).toEqual([
      {
        id: "marloth",
        contentPath: "/workspaces/marloth-story/content",
        access: "readwrite",
      },
      {
        id: "translucence",
        contentPath: "/workspaces/translucence/content",
        access: "readonly",
      },
    ]);
  });

  test("returns undefined for empty input", () => {
    expect(parseTomeCorporaEnv(undefined)).toBeUndefined();
    expect(parseTomeCorporaEnv("")).toBeUndefined();
    expect(parseTomeCorporaEnv("   ")).toBeUndefined();
  });
});
