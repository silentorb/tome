import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import { buildSpatialGraphElements } from "./build-elements";
import { parseSpatialGraphConfig } from "./config";
import { layoutSpatialGraphSvg } from "./layout-svg";
import { selectSpatialGraph } from "./select-nodes";

export interface SpatialGraphRenderResult {
  svg: string;
  html: string;
  nodeCount: number;
  edgeCount: number;
}

export interface SpatialGraphRenderOptions {
  nodePageHref?: (nodeId: string) => string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderSpatialGraph(
  graphQuery: ExtensionGraphQueryServices | undefined,
  typeId: string,
  data: unknown,
  options: SpatialGraphRenderOptions = {},
): Promise<SpatialGraphRenderResult> {
  const config = parseSpatialGraphConfig(data);
  const selection = await selectSpatialGraph(graphQuery, typeId, config);

  if (selection.nodes.length === 0) {
    const html =
      '<figure class="tome-spatial-graph tome-spatial-graph-empty">' +
      "<figcaption>Spatial graph</figcaption>" +
      "<p><em>No nodes found for this type.</em></p>" +
      "</figure>";
    return { svg: "", html, nodeCount: 0, edgeCount: 0 };
  }

  const elements = buildSpatialGraphElements(selection.nodes, selection.edges, config);
  const nodeCount = elements.filter((element) => element.group === "nodes").length;
  const edgeCount = elements.filter((element) => element.group === "edges").length;
  const svgMarkup = await layoutSpatialGraphSvg(elements, config, options.nodePageHref);

  const html =
    '<figure class="tome-spatial-graph">' +
    "<figcaption>Spatial graph</figcaption>" +
    svgMarkup +
    "</figure>";

  return { svg: svgMarkup, html, nodeCount, edgeCount };
}

export function renderSpatialGraphEmptyState(label: string): string {
  return (
    '<figure class="tome-spatial-graph tome-spatial-graph-empty">' +
    `<figcaption>${escapeHtml(label)}</figcaption>` +
    "<p><em>Graph query services unavailable.</em></p>" +
    "</figure>"
  );
}
