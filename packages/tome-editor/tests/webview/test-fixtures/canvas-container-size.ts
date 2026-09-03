/** Per-element size stub for Graph Explorer tests. Do not mock `graph-canvas-size` — bun `mock.module` leaks across files. */

import { setCanRenderCanvas2dForTests } from "../../../src/webview/graph-canvas-size";

export function installGraphCanvasTestEnv(options?: {
  width?: number;
  height?: number;
  canRender2d?: boolean;
}): () => void {
  const width = options?.width ?? 800;
  const height = options?.height ?? 600;
  const OriginalResizeObserver = globalThis.ResizeObserver;
  setCanRenderCanvas2dForTests(options?.canRender2d ?? true);

  globalThis.ResizeObserver = class {
    readonly #callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback;
    }

    observe(target: Element): void {
      Object.defineProperty(target, "clientWidth", { configurable: true, value: width });
      Object.defineProperty(target, "clientHeight", { configurable: true, value: height });
      this.#callback(
        [{ target, contentRect: { width, height } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }

    unobserve(): void {}
    disconnect(): void {}
  };

  return () => {
    globalThis.ResizeObserver = OriginalResizeObserver;
    setCanRenderCanvas2dForTests(undefined);
  };
}
