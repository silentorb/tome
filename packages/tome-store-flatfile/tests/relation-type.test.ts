import { describe, expect, test } from "bun:test";
import { relationType, stripEmojis } from "../src/relation-type";

describe("relation-type", () => {
  test("stripEmojis removes leading symbols", () => {
    expect(stripEmojis("☑️ Features")).toBe("Features");
  });

  test("relationType maps property names to graph relationship types", () => {
    expect(relationType("Bible passages")).toBe("bible_passages");
    expect(relationType("Parents")).toBe("parents");
    expect(relationType("☑️ Features")).toBe("features");
  });
});
