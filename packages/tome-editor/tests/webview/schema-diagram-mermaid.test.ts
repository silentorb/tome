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
  relaxMermaidEdgeLabelBounds,
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

describe("relaxMermaidEdgeLabelBounds", () => {
  test("expands html edge label foreignObject to fit long text", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = `
      <g class="edgeLabel">
        <g class="label" transform="translate(-40, -8)">
          <foreignObject width="40" height="16" overflow="hidden">
            <div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="max-width: 40px">
              <span class="edgeLabel">character_attributes</span>
            </div>
          </foreignObject>
        </g>
      </g>
    `;
    document.body.appendChild(svg);

    const label = svg.querySelector(".label") as SVGGElement;
    const foreignObject = svg.querySelector("foreignObject") as SVGForeignObjectElement;
    const content = foreignObject.querySelector("div") as HTMLElement;
    Object.defineProperty(content, "scrollWidth", { configurable: true, value: 148 });
    Object.defineProperty(content, "scrollHeight", { configurable: true, value: 18 });

    relaxMermaidEdgeLabelBounds(svg);

    expect(foreignObject.getAttribute("overflow")).toBe("visible");
    expect(Number(foreignObject.getAttribute("width"))).toBeGreaterThan(40);
    expect(label.getAttribute("transform")).toMatch(/^translate\(-/);

    svg.remove();
  });

  test("expands svg edge label rect to fit text bbox", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "g");
    label.setAttribute("class", "label");
    label.setAttribute("transform", "translate(-20, -8)");

    const edgeLabel = document.createElementNS("http://www.w3.org/2000/svg", "g");
    edgeLabel.setAttribute("class", "edgeLabel");

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", "20");
    rect.setAttribute("height", "12");

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = "traversal_reasons";

    label.append(rect, text);
    edgeLabel.append(label);
    svg.append(edgeLabel);
    document.body.appendChild(svg);

    text.getBBox = () => ({ x: 0, y: -12, width: 120, height: 14, top: -12, left: 0, right: 120, bottom: 2 } as DOMRect);

    relaxMermaidEdgeLabelBounds(svg);

    expect(Number(rect.getAttribute("width"))).toBeGreaterThan(20);
    expect(label.getAttribute("transform")).toMatch(/^translate\(-/);

    svg.remove();
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
