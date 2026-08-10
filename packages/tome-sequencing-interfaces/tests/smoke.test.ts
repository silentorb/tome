import { describe, expect, test } from "bun:test";
import type { SequencingProblem } from "../src/index";

describe("tome-sequencing-interfaces", () => {
  test("exports SequencingProblem shape", () => {
    const problem: SequencingProblem = {
      events: [{ id: "a", duration: 1 }],
      depends: [],
      defaultDuration: 1,
    };
    expect(problem.events[0]?.id).toBe("a");
  });
});
