import { describe, expect, test } from "bun:test";
import {
  expandDependsConstraints,
  parseEndpointPairs,
} from "../src/depends-endpoints";

describe("depends endpoints", () => {
  test("parses a list of start/end pairs and skips duplicates", () => {
    expect(
      parseEndpointPairs({
        endpoints: [
          { from: "end", to: "start" },
          { from: "start", to: "start" },
          { from: "end", to: "start" },
        ],
      }),
    ).toEqual([
      { from: "end", to: "start" },
      { from: "start", to: "start" },
    ]);
  });

  test("rejects missing or invalid endpoints", () => {
    expect(parseEndpointPairs({})).toBeNull();
    expect(parseEndpointPairs({ endpoints: [{ from: "finish", to: "start" }] })).toBeNull();
    expect(expandDependsConstraints("a", "b", undefined)).toBeNull();
  });
});
