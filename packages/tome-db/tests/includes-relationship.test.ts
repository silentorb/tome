import { describe, expect, test } from "bun:test";
import { relationSectionSupportsLinkExisting } from "../src/includes-relationship";

describe("relationSectionSupportsLinkExisting", () => {
  test("returns true for includes and grouped includes perspectives", () => {
    expect(relationSectionSupportsLinkExisting("includes")).toBe(true);
    expect(relationSectionSupportsLinkExisting("includes:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toBe(
      true,
    );
  });

  test("returns true for associative includes perspective slugs", () => {
    expect(relationSectionSupportsLinkExisting("features")).toBe(true);
    expect(relationSectionSupportsLinkExisting("inspirations")).toBe(true);
    expect(relationSectionSupportsLinkExisting("characters")).toBe(true);
  });

  test("returns true for taxonomy inspiration perspectives", () => {
    expect(relationSectionSupportsLinkExisting("monsters")).toBe(true);
    expect(relationSectionSupportsLinkExisting("pacing")).toBe(true);
    expect(relationSectionSupportsLinkExisting("prop_type")).toBe(true);
  });

  test("returns false for structural one-to-many perspectives", () => {
    expect(relationSectionSupportsLinkExisting("part")).toBe(false);
    expect(relationSectionSupportsLinkExisting("scenes")).toBe(false);
    expect(relationSectionSupportsLinkExisting("parents")).toBe(false);
    expect(relationSectionSupportsLinkExisting("product")).toBe(false);
  });
});
