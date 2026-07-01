import { describe, expect, test, mock, beforeEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

try {
  GlobalRegistrator.register();
} catch {
  // already registered by another test file
}

const initialize = mock(() => {});
const render = mock(async () => ({ svg: "<svg data-testid='mermaid'></svg>" }));
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

mock.module("mermaid", () => ({
  default: {
    initialize,
    render,
  },
}));

mock.module("svg-pan-zoom", () => ({
  default: svgPanZoom,
}));

const {
  destroySchemaDiagramPanZoom,
  renderSchemaDiagramMermaidIn,
} = await import("../../src/webview/extensions/schema-diagram-mermaid");

describe("renderSchemaDiagramMermaidIn", () => {
  beforeEach(() => {
    initialize.mockClear();
    render.mockClear();
    svgPanZoom.mockClear();
    destroy.mockClear();
    fit.mockClear();
    center.mockClear();
    resize.mockClear();
  });

  test("renders mermaid SVG inside a pan/zoom viewport with toolbar", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<figure class="tome-schema-diagram"><pre class="mermaid">erDiagram\n    Scene { }</pre></figure>';
    document.body.appendChild(root);

    await renderSchemaDiagramMermaidIn(root);

    expect(initialize).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
    expect(root.querySelector(".tome-schema-diagram-viewport")).toBeTruthy();
    expect(root.querySelector(".tome-schema-diagram-toolbar")).toBeTruthy();
    expect(root.querySelector(".mermaid-svg-host svg")).toBeTruthy();
    expect(root.querySelector("pre.mermaid")).toBeNull();
    expect(svgPanZoom).toHaveBeenCalled();
    expect(fit).toHaveBeenCalled();
    expect(center).toHaveBeenCalled();

    root.remove();
  });

  test("skips already rendered hosts", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<figure class="tome-schema-diagram"><div class="tome-schema-diagram-viewport"><div class="mermaid-svg-host"><svg></svg></div></div></figure>';
    document.body.appendChild(root);

    await renderSchemaDiagramMermaidIn(root);

    expect(render).not.toHaveBeenCalled();
    expect(svgPanZoom).not.toHaveBeenCalled();

    root.remove();
  });
});

describe("destroySchemaDiagramPanZoom", () => {
  beforeEach(() => {
    destroy.mockClear();
    svgPanZoom.mockClear();
  });

  test("destroys pan-zoom instances for schema diagram figures", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<figure class="tome-schema-diagram"><pre class="mermaid">erDiagram\n    Scene { }</pre></figure>';
    document.body.appendChild(root);

    await renderSchemaDiagramMermaidIn(root);
    destroySchemaDiagramPanZoom(root);

    expect(destroy).toHaveBeenCalled();

    root.remove();
  });
});
