import { describe, expect, test, mock, beforeEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

try {
  GlobalRegistrator.register();
} catch {
  // already registered by another test file
}

const destroy = mock(() => {});
const fit = mock(() => {});
const center = mock(() => {});
const resize = mock(() => {});
const zoomIn = mock(() => {});
const zoomOut = mock(() => {});

const panZoomInstance = {
  destroy,
  fit,
  center,
  resize,
  zoomIn,
  zoomOut,
};

const svgPanZoom = mock(() => panZoomInstance);

mock.module("svg-pan-zoom", () => ({
  default: svgPanZoom,
}));

const {
  destroySchemaDiagramPanZoom,
  initSchemaDiagramViewportsIn,
} = await import("../../src/webview/extensions/schema-diagram-viewport");

function mountDiagramMarkup(): { root: HTMLDivElement; viewport: HTMLElement } {
  const root = document.createElement("div");
  root.innerHTML =
    '<figure class="tome-schema-diagram">' +
    '<div class="tome-schema-diagram-viewport">' +
    '<svg class="schema-diagram-svg" viewBox="0 0 100 60" width="100" height="60"></svg>' +
    "</div></figure>";
  document.body.appendChild(root);
  const viewport = root.querySelector<HTMLElement>(".tome-schema-diagram-viewport")!;
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 640 });
  Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 480 });
  return { root, viewport };
}

describe("initSchemaDiagramViewportsIn", () => {
  beforeEach(() => {
    svgPanZoom.mockClear();
    destroy.mockClear();
    fit.mockClear();
    center.mockClear();
    resize.mockClear();
  });

  test("attaches pan/zoom and toolbar to pre-rendered SVG", () => {
    const { root } = mountDiagramMarkup();

    initSchemaDiagramViewportsIn(root);

    expect(root.querySelector(".schema-diagram-svg-host svg")).toBeTruthy();
    expect(root.querySelector(".tome-schema-diagram-toolbar")).toBeTruthy();
    expect(svgPanZoom).toHaveBeenCalled();
    expect(fit).toHaveBeenCalled();
    expect(center).toHaveBeenCalled();

    root.remove();
  });

  test("defers init until viewport has layout dimensions", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<figure class="tome-schema-diagram">' +
      '<div class="tome-schema-diagram-viewport">' +
      '<svg class="schema-diagram-svg" viewBox="0 0 100 60" width="100" height="60"></svg>' +
      "</div></figure>";
    document.body.appendChild(root);
    const viewport = root.querySelector<HTMLElement>(".tome-schema-diagram-viewport")!;
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 0 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 0 });

    initSchemaDiagramViewportsIn(root);

    expect(svgPanZoom).not.toHaveBeenCalled();
    expect(viewport.dataset.schemaDiagramViewportReady).toBeUndefined();

    root.remove();
  });

  test("skips already initialized viewports", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<figure class="tome-schema-diagram">' +
      '<div class="tome-schema-diagram-viewport" data-schema-diagram-viewport-ready="true">' +
      '<svg class="schema-diagram-svg"></svg>' +
      '<div class="tome-schema-diagram-toolbar"></div>' +
      "</div></figure>";
    document.body.appendChild(root);

    initSchemaDiagramViewportsIn(root);

    expect(svgPanZoom).not.toHaveBeenCalled();

    root.remove();
  });
});

describe("destroySchemaDiagramPanZoom", () => {
  beforeEach(() => {
    destroy.mockClear();
    svgPanZoom.mockClear();
  });

  test("destroys pan-zoom instances for schema diagram figures", () => {
    const { root } = mountDiagramMarkup();

    initSchemaDiagramViewportsIn(root);
    destroySchemaDiagramPanZoom(root);

    expect(destroy).toHaveBeenCalled();

    root.remove();
  });
});
