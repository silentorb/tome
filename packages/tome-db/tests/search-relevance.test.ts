import { describe, expect, test } from "bun:test";
import {
  compareSearchMatchRelevance,
  searchMatchRelevanceScore,
  sortBySearchRelevance,
  sortBySearchRelevanceMulti,
} from "../src/search-relevance";

describe("searchMatchRelevanceScore", () => {
  test("ranks exact match best", () => {
    expect(searchMatchRelevanceScore("Surreal", "Surreal")).toBe(0);
    expect(searchMatchRelevanceScore("Surreal", "surreal")).toBe(0);
  });

  test("ranks prefix before substring", () => {
    expect(searchMatchRelevanceScore("Surface", "Sur")).toBeLessThan(
      searchMatchRelevanceScore("Applied Surrealism", "Sur"),
    );
  });

  test("ranks Surreal before Applied Surrealism for query Surreal", () => {
    expect(searchMatchRelevanceScore("Surreal", "Surreal")).toBeLessThan(
      searchMatchRelevanceScore("Applied Surrealism", "Surreal"),
    );
  });

  test("ranks word-boundary match before later substring", () => {
    expect(searchMatchRelevanceScore("Alpha Surreal", "Surreal")).toBeLessThan(
      searchMatchRelevanceScore("AlphasuffixSurreal", "Surreal"),
    );
  });
});

describe("compareSearchMatchRelevance", () => {
  test("falls back to alphabetical order when query is empty", () => {
    expect(compareSearchMatchRelevance("", "Alpha", "Beta")).toBeLessThan(0);
    expect(compareSearchMatchRelevance("  ", "Beta", "Alpha")).toBeGreaterThan(0);
  });

  test("uses shorter title as tiebreaker", () => {
    expect(compareSearchMatchRelevance("Surf", "Surface", "Surface Tension")).toBeLessThan(0);
  });
});

describe("sortBySearchRelevance", () => {
  test("sorts alphabetically when query is empty", () => {
    const items = [{ name: "Zeta" }, { name: "Alpha" }, { name: "Mike" }];
    expect(sortBySearchRelevance(items, "", (item) => item.name).map((item) => item.name)).toEqual([
      "Alpha",
      "Mike",
      "Zeta",
    ]);
  });

  test("sorts by relevance when query is non-empty", () => {
    const items = [{ name: "Applied Surrealism" }, { name: "Surreal" }];
    expect(sortBySearchRelevance(items, "Surreal", (item) => item.name).map((item) => item.name)).toEqual([
      "Surreal",
      "Applied Surrealism",
    ]);
  });
});

describe("sortBySearchRelevanceMulti", () => {
  test("uses the best score across labels", () => {
    const items = ["features_inspirations", "surreal"];
    const sorted = sortBySearchRelevanceMulti(items, "surreal", (type) => [
      type.replaceAll("_", " "),
      type,
    ]);
    expect(sorted).toEqual(["surreal", "features_inspirations"]);
  });
});
