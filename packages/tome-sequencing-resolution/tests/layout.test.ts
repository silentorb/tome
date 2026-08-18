import { describe, expect, test } from "bun:test";
import { layoutEvents } from "../src/layout";
import type { ResolvedEvent } from "../src/types";

function windows(
  rows: Array<{
    id: string;
    earliestStart: number;
    earliestEnd: number;
    latestStart?: number;
    latestEnd?: number;
  }>,
): ResolvedEvent[] {
  return rows.map((r) => ({
    id: r.id,
    earliestStart: r.earliestStart,
    earliestEnd: r.earliestEnd,
    latestStart: r.latestStart ?? r.earliestStart,
    latestEnd: r.latestEnd ?? r.earliestEnd,
  }));
}

describe("layoutEvents", () => {
  test("empty input", () => {
    expect(layoutEvents([])).toEqual({ events: [], laneCount: 0 });
  });

  test("sequential chain shares one lane", () => {
    const laid = layoutEvents(
      windows([
        { id: "a", earliestStart: 0, earliestEnd: 1 },
        { id: "b", earliestStart: 1, earliestEnd: 2 },
        { id: "c", earliestStart: 2, earliestEnd: 3 },
      ]),
    );
    expect(laid.laneCount).toBe(1);
    expect(laid.events.every((e) => e.lane === 0)).toBe(true);
  });

  test("true concurrency gets distinct lanes", () => {
    const laid = layoutEvents(
      windows([
        { id: "a", earliestStart: 0, earliestEnd: 2 },
        { id: "b", earliestStart: 0, earliestEnd: 2 },
        { id: "c", earliestStart: 1, earliestEnd: 2 },
      ]),
    );
    expect(laid.laneCount).toBe(3);
    const byId = new Map(laid.events.map((e) => [e.id, e]));
    expect(byId.get("a")?.lane).toBe(0);
    expect(byId.get("b")?.lane).toBe(1);
    expect(byId.get("c")?.lane).toBe(2);
  });

  test("same-lane ASAP intervals never overlap", () => {
    const laid = layoutEvents(
      windows([
        { id: "ocean", earliestStart: 0, earliestEnd: 1, latestEnd: 5 },
        { id: "mid", earliestStart: 1, earliestEnd: 2, latestEnd: 4 },
        { id: "wizards", earliestStart: 3, earliestEnd: 4, latestEnd: 4 },
        { id: "closing", earliestStart: 4, earliestEnd: 5, latestEnd: 5 },
        { id: "parallel", earliestStart: 0, earliestEnd: 1, latestEnd: 5 },
      ]),
    );
    const byLane = new Map<number, typeof laid.events>();
    for (const e of laid.events) {
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
    const ocean = laid.events.find((e) => e.id === "ocean")!;
    const wizards = laid.events.find((e) => e.id === "wizards")!;
    // Long ALAP slack must not push Wizards off ocean's lane when ASAP cores abut/sequence.
    expect(ocean.lane).toBe(wizards.lane);
    expect(ocean.start).toBe(0);
    expect(ocean.end).toBe(1);
    expect(wizards.start).toBe(3);
    expect(wizards.end).toBe(4);
  });
});
