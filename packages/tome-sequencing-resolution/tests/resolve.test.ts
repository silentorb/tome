import { describe, expect, test } from "bun:test";
import type { SequencingProblem } from "tome-sequencing-interfaces";
import { resolve } from "../src/index";

describe("resolve", () => {
  test("empty problem", () => {
    const result = resolve({ events: [], depends: [], defaultDuration: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.events).toEqual([]);
  });

  test("single event window", () => {
    const result = resolve({
      events: [{ id: "a", duration: 2 }],
      depends: [],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]).toEqual({
      id: "a",
      earliestStart: 0,
      latestStart: 0,
      earliestEnd: 2,
      latestEnd: 2,
    });
  });

  test("chain A → B → C", () => {
    const problem: SequencingProblem = {
      events: [
        { id: "a", duration: 1 },
        { id: "b", duration: 1 },
        { id: "c", duration: 1 },
      ],
      depends: [
        { prerequisiteId: "a", dependentId: "b", from: "end", to: "start" },
        { prerequisiteId: "b", dependentId: "c", from: "end", to: "start" },
      ],
      defaultDuration: 1,
    };
    const result = resolve(problem);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(result.events.map((e) => [e.id, e]));
    expect(byId.a?.earliestStart).toBe(0);
    expect(byId.b?.earliestStart).toBe(1);
    expect(byId.c?.earliestStart).toBe(2);
    expect(byId.a?.latestStart).toBe(0);
    expect(byId.c?.earliestEnd).toBe(3);
  });

  test("diamond with slack on one branch", () => {
    const result = resolve({
      events: [
        { id: "start", duration: 1 },
        { id: "short", duration: 1 },
        { id: "long", duration: 3 },
        { id: "end", duration: 1 },
      ],
      depends: [
        { prerequisiteId: "start", dependentId: "short", from: "end", to: "start" },
        { prerequisiteId: "start", dependentId: "long", from: "end", to: "start" },
        { prerequisiteId: "short", dependentId: "end", from: "end", to: "start" },
        { prerequisiteId: "long", dependentId: "end", from: "end", to: "start" },
      ],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const short = result.events.find((e) => e.id === "short")!;
    expect(short.earliestStart).toBe(1);
    expect(short.latestStart).toBe(3);
    expect(short.latestStart).toBeGreaterThan(short.earliestStart);
  });

  test("parallel bands share start when no depends", () => {
    const result = resolve({
      events: [
        { id: "a", duration: 2 },
        { id: "b", duration: 2 },
      ],
      depends: [],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.every((e) => e.earliestStart === 0)).toBe(true);
  });

  test("non-parallel pair gets sequential order", () => {
    const result = resolve({
      events: [
        { id: "a", duration: 1 },
        { id: "b", duration: 1 },
      ],
      depends: [],
      defaultDuration: 1,
      canRunParallel: () => false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(result.events.map((e) => [e.id, e]));
    expect(byId.a?.earliestEnd).toBeLessThanOrEqual(byId.b?.earliestStart ?? 0);
  });

  test("cycle fails", () => {
    const result = resolve({
      events: [
        { id: "a", duration: 1 },
        { id: "b", duration: 1 },
      ],
      depends: [
        { prerequisiteId: "a", dependentId: "b", from: "end", to: "start" },
        { prerequisiteId: "b", dependentId: "a", from: "end", to: "start" },
      ],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("cycle");
  });

  test("unknown depends endpoint fails", () => {
    const result = resolve({
      events: [{ id: "a", duration: 1 }],
      depends: [{ prerequisiteId: "a", dependentId: "missing", from: "end", to: "start" }],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unknown_event");
  });

  test("containment tightens child into parent", () => {
    const result = resolve({
      events: [
        { id: "parent", duration: 4 },
        { id: "child", duration: 1, parentIds: ["parent"] },
      ],
      depends: [],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.events.find((e) => e.id === "child")!;
    const parent = result.events.find((e) => e.id === "parent")!;
    expect(child.earliestStart).toBeGreaterThanOrEqual(parent.earliestStart);
    expect(child.latestEnd).toBeLessThanOrEqual(parent.latestEnd);
  });

  test("default duration applies when omitted", () => {
    const result = resolve({
      events: [{ id: "a" }],
      depends: [],
      defaultDuration: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]?.earliestEnd).toBe(3);
  });

  test("start → start lets the dependent start with the prerequisite", () => {
    const result = resolve({
      events: [
        { id: "a", duration: 3 },
        { id: "b", duration: 1 },
      ],
      depends: [{ prerequisiteId: "a", dependentId: "b", from: "start", to: "start" }],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(result.events.map((e) => [e.id, e]));
    expect(byId.a?.earliestStart).toBe(0);
    expect(byId.b?.earliestStart).toBe(0);
    expect(byId.b?.earliestEnd).toBe(1);
  });

  test("end → end stretches a flex dependent to cover the prerequisite finish", () => {
    const result = resolve({
      events: [
        { id: "a", duration: 3 },
        { id: "b", duration: "flex" },
      ],
      depends: [{ prerequisiteId: "a", dependentId: "b", from: "end", to: "end" }],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(result.events.map((e) => [e.id, e]));
    expect(byId.b?.earliestStart).toBe(0);
    expect(byId.b?.earliestEnd).toBe(3);
  });

  test("end → end shifts a fixed dependent later instead of stretching", () => {
    const result = resolve({
      events: [
        { id: "a", duration: 3 },
        { id: "b", duration: 1 },
      ],
      depends: [{ prerequisiteId: "a", dependentId: "b", from: "end", to: "end" }],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(result.events.map((e) => [e.id, e]));
    expect(byId.b?.earliestStart).toBe(2);
    expect(byId.b?.earliestEnd).toBe(3);
  });

  test("start → end waits for the prerequisite start before the dependent can finish", () => {
    const result = resolve({
      events: [
        { id: "a", duration: 3 },
        { id: "b", duration: 1 },
      ],
      depends: [{ prerequisiteId: "a", dependentId: "b", from: "start", to: "end" }],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(result.events.map((e) => [e.id, e]));
    expect(byId.b?.earliestStart).toBe(0);
    expect(byId.b?.earliestEnd).toBe(1);
  });

  test("boxing start → start and end → end aligns a flex inner event to the outer range", () => {
    const result = resolve({
      events: [
        { id: "outer", duration: 4 },
        { id: "inner", duration: "flex" },
      ],
      depends: [
        { prerequisiteId: "outer", dependentId: "inner", from: "start", to: "start" },
        { prerequisiteId: "outer", dependentId: "inner", from: "end", to: "end" },
      ],
      defaultDuration: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byId = Object.fromEntries(result.events.map((e) => [e.id, e]));
    expect(byId.inner?.earliestStart).toBe(0);
    expect(byId.inner?.earliestEnd).toBe(4);
  });
});
