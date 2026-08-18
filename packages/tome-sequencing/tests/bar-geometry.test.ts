import { describe, expect, test } from "bun:test";
import { EVENT_BAR_GAP_PX, eventBarRect } from "../src/bar-geometry";

describe("eventBarRect", () => {
  test("insets each side so abutting intervals leave a gap", () => {
    const x = (t: number) => t * 100;
    const a = eventBarRect(x, 0, 1);
    const b = eventBarRect(x, 1, 2);
    expect(a.x).toBe(EVENT_BAR_GAP_PX / 2);
    expect(a.width).toBe(100 - EVENT_BAR_GAP_PX);
    expect(b.x).toBe(100 + EVENT_BAR_GAP_PX / 2);
    // Gap between trailing edge of a and leading edge of b
    expect(b.x - (a.x + a.width)).toBe(EVENT_BAR_GAP_PX);
  });

  test("keeps a minimum width for very short bars", () => {
    const x = (t: number) => t * 3;
    const bar = eventBarRect(x, 0, 1);
    expect(bar.width).toBeGreaterThanOrEqual(2);
  });
});
