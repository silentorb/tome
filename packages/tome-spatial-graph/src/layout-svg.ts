import { createCanvas } from "canvas";
import { JSDOM } from "jsdom";
import type { CytoscapeElementDefinition } from "./build-elements";
import { reserveCompoundHeaderSpace } from "./compound-header";
import type { SpatialGraphConfig } from "./config";
import {
  injectSpatialGraphNodeLinks,
  SVG_EXPORT_PADDING,
  trimSpatialGraphSvg,
  type SpatialGraphNodeLinkOverlay,
} from "./svg-export";

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
            shape: "ellipse",
            width: "label",
            height: "label",
            padding: 10,
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
            label: "data(label)",
            "font-size": 11,
            color: "#e2e8f0",
            "text-halign": "center",
            "text-valign": "top",
            "text-margin-y": 8,
            "text-wrap": "wrap",
            "text-max-width": 120,
            "text-background-color": "#1a202c",
            "text-background-opacity": 0.75,
            "text-background-shape": "round-rectangle",
            "text-background-padding": 6,
            width: 1,
            height: 1,
            padding: 16,
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
      nodeDimensionsIncludeLabels: true,
      ...config.layout,
    });
    layout.run();

    reserveCompoundHeaderSpace(cy, config.parentHeaderHeight);
    cy.nodes().dirtyCompoundBoundsCache();
    cy.forceRender();
    const linkOverlays: SpatialGraphNodeLinkOverlay[] = [];
    for (const node of cy.nodes()) {
      const nodeId = node.data("canonicalId");
      if (typeof nodeId !== "string" || nodeId.length === 0) continue;
      const box = node.renderedBoundingBox();
      linkOverlays.push({
        nodeId,
        href: nodePageHref(nodeId),
        x: box.x1,
        y: box.y1,
        width: box.w,
        height: box.h,
      });
    }

    const pxRatio = cy.renderer().getPixelRatio();
    const rawSvg = cy.svg({
      full: true,
      scale: config.svg.scale / pxRatio,
      bg: config.svg.bg,
    }) as string;
    const linkedSvg = injectSpatialGraphNodeLinks(rawSvg, linkOverlays);

    cy.destroy();
    return trimSpatialGraphSvg(linkedSvg, SVG_EXPORT_PADDING);
  });
}
