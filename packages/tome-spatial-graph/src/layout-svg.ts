import { createCanvas } from "canvas";
import { JSDOM } from "jsdom";
import { PARENT_LABEL_NODE_CLASS, type CytoscapeElementDefinition } from "./build-elements";
import type { SpatialGraphConfig } from "./config";

let extensionsRegistered = false;
/** cytoscape-svg reads `window` at import time; serialize headless renders so globals are not restored mid-export. */
let domRenderLock: Promise<void> = Promise.resolve();

async function withDom<T>(run: (container: HTMLElement) => Promise<T> | T): Promise<T> {
  const previousLock = domRenderLock;
  let releaseLock!: () => void;
  domRenderLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await previousLock;

  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="cy"></div></body></html>`, {
    pretendToBeVisual: true,
    resources: "usable",
  });

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;

  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;
  globalThis.XMLSerializer = dom.window.XMLSerializer;

  dom.window.HTMLCanvasElement.prototype.getContext = function (type: string) {
    const width = this.width > 0 ? this.width : 800;
    const height = this.height > 0 ? this.height : 600;
    const canvas = createCanvas(width, height);
    if (type === "2d") {
      return canvas.getContext("2d");
    }
    return null;
  } as typeof dom.window.HTMLCanvasElement.prototype.getContext;

  try {
    const container = dom.window.document.querySelector("#cy");
    if (!container) {
      throw new Error("Missing cytoscape container");
    }
    return await run(container);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.navigator = previousNavigator;
    dom.window.close();
    releaseLock();
  }
}

export async function layoutSpatialGraphSvg(
  elements: CytoscapeElementDefinition[],
  config: SpatialGraphConfig,
): Promise<string> {
  if (elements.length === 0) {
    return "";
  }

  return withDom(async (container) => {
    const cytoscapeModule = await import("cytoscape");
    const cytoscape = cytoscapeModule.default;
    if (!extensionsRegistered) {
      const fcose = (await import("cytoscape-fcose")).default;
      const svg = (await import("cytoscape-svg")).default;
      cytoscape.use(fcose);
      cytoscape.use(svg);
      extensionsRegistered = true;
    }

    const cy = cytoscape({
      container,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 10,
            "background-color": "#4a5568",
            color: "#ffffff",
            width: 40,
            height: 40,
            "text-wrap": "wrap",
            "text-max-width": 80,
          },
        },
        {
          selector: ":parent",
          style: {
            "background-color": "#2d3748",
            "background-opacity": 0.15,
            "border-color": "#718096",
            "border-width": 1,
            label: "",
            padding: 16,
          },
        },
        {
          selector: `node.${PARENT_LABEL_NODE_CLASS}`,
          style: {
            label: "data(label)",
            "font-size": 11,
            color: "#e2e8f0",
            "background-opacity": 0,
            "border-width": 0,
            width: 1,
            height: 1,
            padding: 0,
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": 120,
          },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#a0aec0",
            "target-arrow-shape": "none",
            "curve-style": "bezier",
          },
        },
      ],
      layout: { name: "preset" },
    });

    const layout = cy.layout({
      name: "fcose",
      quality: "default",
      randomize: true,
      animate: false,
      fit: true,
      padding: 30,
      ...config.layout,
    });
    layout.run();

    return cy.svg({
      full: config.svg.full,
      scale: config.svg.scale,
      bg: config.svg.bg,
    }) as string;
  });
}
