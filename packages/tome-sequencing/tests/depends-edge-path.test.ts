import { describe, expect, test } from "bun:test";
import { dependsEdgePath } from "../src/depends-edge-path";

describe("dependsEdgePath", () => {
  test("emits a cubic curve, not a polyline", () => {
    const path = dependsEdgePath(10, 20, 80, 60);
    expect(path).toContain("C ");
    expect(path.startsWith("M ")).toBe(true);
    expect(path).not.toMatch(/\s[LHV]\s/);
  });

  test("same-lane edges bulge so the curve is visible", () => {
    const up = dependsEdgePath(10, 24, 90, 24, 1);
    const down = dependsEdgePath(10, 24, 90, 24, -1);
    expect(up).toContain("C ");
    expect(up).not.toBe(down);
  });
});
