/** Cool-toned palette for individual record nodes (distinct from cluster amber). */
const RECORD_GROUP_COLORS = [
  "#6cb6ff",
  "#7eb88f",
  "#c792ea",
  "#82aaff",
  "#89ddff",
  "#f07178",
  "#dcdcaa",
  "#56b6c2",
  "#a9dc76",
  "#ff9cac",
] as const;

const CLUSTER_COLOR_FALLBACK = "#d4a24c";
const ANCHOR_COLOR_FALLBACK = "#7ee787";

export interface GraphColorNode {
  id: string;
  isCluster?: boolean;
  group?: string;
  bundle?: { gatewayId: string };
}

export interface GraphNodeColorOptions {
  clusterColor?: string;
  anchorColor?: string;
  anchorId?: string;
}

export interface GraphLegendEntry {
  label: string;
  color: string;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function recordGroupColor(group: string): string {
  const index = hashString(group) % RECORD_GROUP_COLORS.length;
  return RECORD_GROUP_COLORS[index]!;
}

export function isAnchorGraphNode(node: GraphColorNode, anchorId?: string): boolean {
  if (!anchorId) return false;
  if (node.id === anchorId) return true;
  if (node.bundle?.gatewayId === anchorId) return true;
  return false;
}

export function resolveGraphNodeColor(
  node: GraphColorNode,
  options: GraphNodeColorOptions | string = {},
): string {
  const resolved =
    typeof options === "string"
      ? { clusterColor: options }
      : options;
  const clusterColor = resolved.clusterColor ?? CLUSTER_COLOR_FALLBACK;
  const anchorColor = resolved.anchorColor ?? ANCHOR_COLOR_FALLBACK;
  if (isAnchorGraphNode(node, resolved.anchorId)) return anchorColor;
  if (node.isCluster) return clusterColor;
  return recordGroupColor(node.group ?? "Unknown");
}

export function buildGraphLegendEntries(
  nodes: GraphColorNode[],
  options: { anchorId?: string; clusterColor: string; anchorColor: string },
): GraphLegendEntry[] {
  const recordGroups = new Set<string>();
  let hasAnchor = false;
  let hasCluster = false;

  for (const node of nodes) {
    if (isAnchorGraphNode(node, options.anchorId)) {
      hasAnchor = true;
      continue;
    }
    if (node.isCluster) {
      hasCluster = true;
      continue;
    }
    recordGroups.add(node.group ?? "Unknown");
  }

  const entries: GraphLegendEntry[] = [];
  if (hasAnchor) entries.push({ label: "Anchor", color: options.anchorColor });
  if (hasCluster) entries.push({ label: "Cluster", color: options.clusterColor });

  for (const group of [...recordGroups].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))) {
    entries.push({ label: group, color: recordGroupColor(group) });
  }

  return entries;
}

export { ANCHOR_COLOR_FALLBACK, CLUSTER_COLOR_FALLBACK };
