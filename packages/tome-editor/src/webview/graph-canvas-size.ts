export interface CanvasSize {
  width: number;
  height: number;
}

export function measureCanvasSize(container: HTMLElement): CanvasSize | null {
  let width = Math.floor(container.clientWidth);
  let height = Math.floor(container.clientHeight);

  if (width <= 0 || height <= 0) {
    const rect = container.getBoundingClientRect();
    if (width <= 0) width = Math.floor(rect.width);
    if (height <= 0) height = Math.floor(rect.height);
  }

  if (width <= 0 || height <= 0) {
    const parent = container.parentElement;
    if (parent) {
      if (width <= 0) width = Math.floor(parent.clientWidth);
      if (height <= 0) height = Math.floor(parent.clientHeight);
    }
  }

  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

let canRenderCanvas2dForTests: boolean | undefined;

/** Test-only override. Dimension checks still run, so invalid sizes stay rejected. */
export function setCanRenderCanvas2dForTests(value: boolean | undefined): void {
  canRenderCanvas2dForTests = value;
}

export function canRenderCanvas2d(width: number, height: number): boolean {
  if (typeof document === "undefined") return false;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  if (canRenderCanvas2dForTests !== undefined) return canRenderCanvas2dForTests;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return Boolean(canvas.getContext("2d"));
}
