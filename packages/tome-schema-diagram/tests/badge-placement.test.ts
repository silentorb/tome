import { describe, expect, test } from "bun:test";
import { badgePlacement, measureMemberBadgeSize } from "../src/render-svg";

describe("badgePlacement", () => {
  const node = { x: 100, y: 200, width: 120, height: 36 };
  const size = measureMemberBadgeSize(3);

  test("places badge on bottom-right by default corner math", () => {
    const { x, y } = badgePlacement(
      node.x,
      node.y,
      node.width,
      node.height,
      size.width,
      size.height,
      "bottom-right",
    );
    expect(x).toBeGreaterThan(node.x + node.width - size.width);
    expect(y).toBeGreaterThan(node.y + node.height - size.height);
  });

  test("places badge on top-left outside node origin", () => {
    const { x, y } = badgePlacement(
      node.x,
      node.y,
      node.width,
      node.height,
      size.width,
      size.height,
      "top-left",
    );
    expect(x).toBeLessThan(node.x);
    expect(y).toBeLessThan(node.y);
  });

  test("places badge on top-right above node", () => {
    const { x, y } = badgePlacement(
      node.x,
      node.y,
      node.width,
      node.height,
      size.width,
      size.height,
      "top-right",
    );
    expect(x).toBeGreaterThan(node.x);
    expect(y).toBeLessThan(node.y);
  });

  test("places badge on bottom-left below node", () => {
    const { x, y } = badgePlacement(
      node.x,
      node.y,
      node.width,
      node.height,
      size.width,
      size.height,
      "bottom-left",
    );
    expect(x).toBeLessThan(node.x);
    expect(y).toBeGreaterThan(node.y);
  });
});
