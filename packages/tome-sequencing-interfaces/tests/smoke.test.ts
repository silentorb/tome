import { describe, expect, test } from "bun:test";
import type { DependsConstraint, SequencingProblem } from "../src/index";

describe("tome-sequencing-interfaces", () => {
  test("exports SequencingProblem shape", () => {
    const depends: DependsConstraint = {
      prerequisiteId: "a",
      dependentId: "b",
      from: "end",
      to: "start",
    };
    const problem: SequencingProblem = {
      events: [{ id: "a", duration: 1 }],
      depends: [depends],
      defaultDuration: 1,
    };
    expect(problem.events[0]?.id).toBe("a");
    expect(depends.from).toBe("end");
    expect(depends.to).toBe("start");
  });
});
