import { describe, expect, test } from "bun:test";
import { buildTimelineLayoutFromGroupedResolved, buildTimelineLayoutFromResolved } from "../src/layout";

describe("buildTimelineLayoutFromResolved", () => {
  test("assigns ASAP placements and time extent", () => {
    const layout = buildTimelineLayoutFromResolved({
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
      depends: [{ prerequisiteId: "a", dependentId: "b", from: "end", to: "start" }],
    });
    expect(layout.timeMax).toBe(2);
    expect(layout.events[0]?.title).toBe("Alpha");
    expect(layout.depends).toHaveLength(1);
    expect(layout.laneCount).toBe(1);
    expect(layout.events.every((e) => e.lane === 0)).toBe(true);
  });

  test("overlapping ASAP cores get distinct lanes", () => {
    const layout = buildTimelineLayoutFromResolved({
      resolved: [
        {
          id: "a",
          earliestStart: 0,
          latestStart: 0,
          earliestEnd: 2,
          latestEnd: 5,
        },
        {
          id: "b",
          earliestStart: 0,
          latestStart: 1,
          earliestEnd: 2,
          latestEnd: 5,
        },
        {
          id: "c",
          earliestStart: 1,
          latestStart: 1,
          earliestEnd: 3,
          latestEnd: 5,
        },
      ],
      titles: new Map([
        ["a", "A"],
        ["b", "B"],
        ["c", "C"],
      ]),
      depends: [],
    });
    const byId = new Map(layout.events.map((e) => [e.id, e]));
    expect(byId.get("a")?.lane).toBe(0);
    expect(byId.get("b")?.lane).toBe(1);
    expect(byId.get("c")?.lane).toBe(2);
    expect(layout.laneCount).toBe(3);
  });

  test("long ALAP slack does not hide later ASAP bars on the same lane", () => {
    const layout = buildTimelineLayoutFromResolved({
      resolved: [
        {
          id: "ocean",
          earliestStart: 0,
          latestStart: 4,
          earliestEnd: 1,
          latestEnd: 5,
        },
        {
          id: "wizards",
          earliestStart: 3,
          latestStart: 3,
          earliestEnd: 4,
          latestEnd: 4,
        },
      ],
      titles: new Map([
        ["ocean", "Ocean liner"],
        ["wizards", "Wizards tame the chaos"],
      ]),
      depends: [],
    });
    const ocean = layout.events.find((e) => e.id === "ocean")!;
    const wizards = layout.events.find((e) => e.id === "wizards")!;
    expect(ocean.lane).toBe(wizards.lane);
    expect(ocean.start).toBe(0);
    expect(ocean.end).toBe(1);
    expect(wizards.start).toBe(3);
    expect(wizards.end).toBe(4);
    // Drawn exclusive boxes do not overlap
    expect(wizards.start).toBeGreaterThanOrEqual(ocean.end);
  });

  test("grouped resolved events stack lanes by group then overlap", () => {
    const layout = buildTimelineLayoutFromGroupedResolved({
      groups: [
        {
          resolved: [
            {
              id: "p1",
              earliestStart: 0,
              latestStart: 0,
              earliestEnd: 2,
              latestEnd: 2,
            },
            {
              id: "p2",
              earliestStart: 0,
              latestStart: 0,
              earliestEnd: 1,
              latestEnd: 1,
            },
          ],
          titles: new Map([
            ["p1", "Primary A"],
            ["p2", "Primary B"],
          ]),
        },
        {
          resolved: [
            {
              id: "h1",
              earliestStart: 0,
              latestStart: 0,
              earliestEnd: 1,
              latestEnd: 1,
            },
          ],
          titles: new Map([["h1", "High A"]]),
        },
      ],
      depends: [],
    });
    const byId = new Map(layout.events.map((e) => [e.id, e]));
    const primaryLanes = [byId.get("p1")?.lane, byId.get("p2")?.lane].sort();
    expect(primaryLanes).toEqual([0, 1]);
    expect(byId.get("h1")?.lane).toBe(2);
    expect(layout.laneCount).toBe(3);
  });

  test("same-lane ASAP intervals never overlap", () => {
    const layout = buildTimelineLayoutFromResolved({
      resolved: [
        {
          id: "a",
          earliestStart: 0,
          latestStart: 0,
          earliestEnd: 1,
          latestEnd: 5,
        },
        {
          id: "b",
          earliestStart: 0,
          latestStart: 0,
          earliestEnd: 1,
          latestEnd: 5,
        },
        {
          id: "c",
          earliestStart: 1,
          latestStart: 1,
          earliestEnd: 2,
          latestEnd: 5,
        },
      ],
      titles: new Map([
        ["a", "A"],
        ["b", "B"],
        ["c", "C"],
      ]),
      depends: [],
    });
    const byLane = new Map<number, typeof layout.events>();
    for (const e of layout.events) {
      const list = byLane.get(e.lane) ?? [];
      list.push(e);
      byLane.set(e.lane, list);
    }
    for (const group of byLane.values()) {
      const sorted = [...group].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
      }
    }
  });
});
