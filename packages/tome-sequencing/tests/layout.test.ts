import { describe, expect, test } from "bun:test";
import { buildTimelineLayout } from "../src/layout";

describe("buildTimelineLayout", () => {
  test("assigns tracks and time extent", () => {
    const layout = buildTimelineLayout({
      resolved: [
        {
          id: "a",
          earliestStart: 0,
          latestStart: 0,
          earliestEnd: 1,
          latestEnd: 2,
        },
        {
          id: "b",
          earliestStart: 1,
          latestStart: 1,
          earliestEnd: 2,
          latestEnd: 2,
        },
      ],
      titles: new Map([
        ["a", "Alpha"],
        ["b", "Beta"],
      ]),
      trackById: new Map([
        ["a", "Epic"],
        ["b", "Primary"],
      ]),
      depends: [{ prerequisiteId: "a", dependentId: "b" }],
    });
    expect(layout.tracks).toEqual(["Epic", "Primary"]);
    expect(layout.timeMax).toBe(2);
    expect(layout.events[0]?.title).toBe("Alpha");
    expect(layout.depends).toHaveLength(1);
  });
});
