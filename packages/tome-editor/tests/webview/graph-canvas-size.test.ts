import { describe, expect, test } from "bun:test";
import { measureCanvasSize, canRenderCanvas2d } from "../../src/webview/graph-canvas-size";

describe("graph-canvas-size", () => {
  test("measureCanvasSize returns null when container has no dimensions", () => {
    const container = document.createElement("div");
    expect(measureCanvasSize(container)).toBeNull();
  });

  test("measureCanvasSize reads client dimensions", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 640 });
    Object.defineProperty(container, "clientHeight", { value: 480 });
    expect(measureCanvasSize(container)).toEqual({ width: 640, height: 480 });
  });

  test("canRenderCanvas2d rejects invalid dimensions", () => {
    expect(canRenderCanvas2d(0, 100)).toBe(false);
    expect(canRenderCanvas2d(100, -1)).toBe(false);
  });
});
