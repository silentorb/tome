import { createCanvas } from "canvas";
import { JSDOM } from "jsdom";
import type { CytoscapeElementDefinition } from "./build-elements";
import type { SpatialGraphConfig } from "./config";
import {
  collectSpatialGraphNodeLinkOverlays,
  injectSpatialGraphNodeLinks,
} from "./svg-export";

let extensionsRegistered = false;
/** cytoscape-svg reads `window` at import time; serialize headless renders so globals are not restored mid-export. */
let domRenderLock: Promise<void> = Promise.resolve();

const BASE_NODE_WIDTH = 40;
const BASE_NODE_HEIGHT = 40;
const BASE_NODE_PADDING = 10;
const BASE_NODE_FONT_SIZE = 10;
const BASE_PARENT_TEXT_MAX_WIDTH = 120;
const BASE_PARENT_FONT_SIZE = 11;
const BASE_PARENT_PADDING_SIDE = 16;
const BASE_PARENT_PADDING_BOTTOM = 16;
const BASE_PARENT_TEXT_MARGIN_Y = 8;
const BASE_PARENT_TEXT_BACKGROUND_PADDING = 6;
const BASE_PARENT_HEADER_PADDING = 16;

export interface SpatialGraphStylesheetEntry {
  selector: string;
  style: Record<string, string | number>;
}

export function buildSpatialGraphStylesheet(config: SpatialGraphConfig): SpatialGraphStylesheetEntry[] {
  const { x: scaleX, y: scaleY } = config.nodeDimensionScale;
  const compoundPaddingTop = config.parentHeaderHeight + BASE_PARENT_HEADER_PADDING;

  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": BASE_NODE_FONT_SIZE,
        "background-color": "#4a5568",
        color: "#ffffff",
        shape: "ellipse",
        width: BASE_NODE_WIDTH * scaleX,
        height: BASE_NODE_HEIGHT * scaleY,
        padding: BASE_NODE_PADDING,
        "text-wrap": "wrap",
        "text-max-width": BASE_NODE_WIDTH * scaleX,
      },
    },
    {
      selector: ":parent",
      style: {
        "background-color": "#2d3748",
        "background-opacity": 0.15,
        "border-color": "#718096",
        "border-width": 1,
        label: "data(label)",
        "font-size": BASE_PARENT_FONT_SIZE,
        color: "#e2e8f0",
        "text-halign": "center",
        "text-valign": "top",
        "text-margin-y": BASE_PARENT_TEXT_MARGIN_Y,
        "text-wrap": "wrap",
        "text-max-width": BASE_PARENT_TEXT_MAX_WIDTH,
        "text-background-color": "#1a202c",
        "text-background-opacity": 0.75,
        "text-background-shape": "round-rectangle",
        "text-background-padding": BASE_PARENT_TEXT_BACKGROUND_PADDING,
        width: 1,
        height: 1,
        "padding-top": compoundPaddingTop,
        "padding-bottom": BASE_PARENT_PADDING_BOTTOM * scaleY,
        "padding-left": BASE_PARENT_PADDING_SIDE * scaleX,
        "padding-right": BASE_PARENT_PADDING_SIDE * scaleX,
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
  ];
}

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
  nodePageHref: (nodeId: string) => string = (nodeId) => `./${nodeId.toLowerCase()}.md`,
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
      style: buildSpatialGraphStylesheet(config),
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

    const linkOverlays = collectSpatialGraphNodeLinkOverlays(cy, nodePageHref);
    const pxRatio = cy.renderer().getPixelRatio();
    const rawSvg = cy.svg({
      full: config.svg.full,
      scale: config.svg.scale / pxRatio,
      bg: config.svg.bg,
    }) as string;

    cy.destroy();
    return injectSpatialGraphNodeLinks(rawSvg, linkOverlays);
  });
}
