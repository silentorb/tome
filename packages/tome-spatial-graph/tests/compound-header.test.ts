import { describe, expect, test } from "bun:test";
import { createCanvas } from "canvas";
import cytoscape from "cytoscape";
import { JSDOM } from "jsdom";
import { DEFAULT_PARENT_HEADER_HEIGHT, reserveCompoundHeaderSpace } from "../src/compound-header";

function withCytoscape(run: (cy: cytoscape.Core) => void): void {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="cy"></div></body></html>`, {
    pretendToBeVisual: true,
  });

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;

  dom.window.HTMLCanvasElement.prototype.getContext = function (type: string) {
    const width = this.width > 0 ? this.width : 800;
    const height = this.height > 0 ? this.height : 600;
    const canvas = createCanvas(width, height);
    if (type === "2d") {
      return canvas.getContext("2d");
    }
    return null;
  } as typeof dom.window.HTMLCanvasElement.prototype.getContext;

  let cy: cytoscape.Core | undefined;

  try {
    const container = dom.window.document.querySelector("#cy");
    if (!container) throw new Error("Missing cytoscape container");

    cy = cytoscape({
      container,
      elements: [
        { data: { id: "parent", label: "Parent" } },
        { data: { id: "child", label: "Child", parent: "parent" } },
      ],
      style: [{ selector: "node", style: {} }],
      layout: { name: "preset" },
    });

    run(cy);
  } finally {
    cy?.destroy();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    dom.window.close();
  }
}

describe("reserveCompoundHeaderSpace", () => {
  test("shifts direct children down by header height", () => {
    withCytoscape((cy) => {
      cy.getElementById("child").position({ x: 100, y: 50 });

      reserveCompoundHeaderSpace(cy, DEFAULT_PARENT_HEADER_HEIGHT);

      const pos = cy.getElementById("child").position();
      expect(pos.y).toBe(50 + DEFAULT_PARENT_HEADER_HEIGHT);
    });
  });
});
