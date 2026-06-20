export const GRAPH_SHOW_NODE_LABELS_KEY = "tome.graph.showNodeLabels";
export const GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY = "tome.graph.showRelevanceDiagnostics";
export const GRAPH_EXPLORER_MODE_KEY = "tome.graph.explorerMode";
export const GRAPH_EXPLORER_LAYER_DEPTH_KEY = "tome.graph.layerDepth";
export const GRAPH_EXPLORER_RELATIVE_DETAIL_KEY = "tome.graph.relativeDetail";

export const LEGACY_GRAPH_SHOW_NODE_LABELS_KEY = "marloth.graph.showNodeLabels";
export const LEGACY_GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY = "marloth.graph.showRelevanceDiagnostics";
export const LEGACY_GRAPH_EXPLORER_MODE_KEY = "marloth.graph.explorerMode";
export const LEGACY_GRAPH_EXPLORER_LAYER_DEPTH_KEY = "marloth.graph.layerDepth";
export const LEGACY_GRAPH_EXPLORER_RELATIVE_DETAIL_KEY = "marloth.graph.relativeDetail";

export const DEFAULT_GRAPH_EXPLORER_LAYER_DEPTH = 3;
export const DEFAULT_GRAPH_EXPLORER_RELATIVE_DETAIL = 2;
export const MIN_GRAPH_EXPLORER_LAYER_DEPTH = 2;
export const MAX_GRAPH_EXPLORER_LAYER_DEPTH = 10;
export const MIN_GRAPH_EXPLORER_RELATIVE_DETAIL = 1;

export type GraphExplorerMode = "layers" | "relative";

function readBool(key: string, legacyKey: string, defaultValue: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw !== null) return raw === "1";
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) return legacy === "1";
  return defaultValue;
}

export function normalizeGraphExplorerRelativeDetail(
  value: number,
  layerDepth = DEFAULT_GRAPH_EXPLORER_LAYER_DEPTH,
): number {
  const max = normalizeGraphExplorerLayerDepth(layerDepth);
  if (!Number.isFinite(value)) {
    return Math.min(DEFAULT_GRAPH_EXPLORER_RELATIVE_DETAIL, max);
  }
  return Math.min(max, Math.max(MIN_GRAPH_EXPLORER_RELATIVE_DETAIL, Math.round(value)));
}

export function readGraphShowNodeLabels(): boolean {
  try {
    return readBool(GRAPH_SHOW_NODE_LABELS_KEY, LEGACY_GRAPH_SHOW_NODE_LABELS_KEY, false);
  } catch {
    return false;
  }
}

export function writeGraphShowNodeLabels(value: boolean): void {
  try {
    localStorage.setItem(GRAPH_SHOW_NODE_LABELS_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

export function readGraphShowRelevanceDiagnostics(): boolean {
  try {
    return readBool(
      GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY,
      LEGACY_GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY,
      false,
    );
  } catch {
    return false;
  }
}

export function writeGraphShowRelevanceDiagnostics(value: boolean): void {
  try {
    localStorage.setItem(GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

export function readGraphExplorerMode(): GraphExplorerMode {
  try {
    const value = localStorage.getItem(GRAPH_EXPLORER_MODE_KEY);
    if (value === "relative") return "relative";
    if (value === "layers") return "layers";
    const legacy = localStorage.getItem(LEGACY_GRAPH_EXPLORER_MODE_KEY);
    if (legacy === "relative") return "relative";
    return "layers";
  } catch {
    return "layers";
  }
}

export function writeGraphExplorerMode(value: GraphExplorerMode): void {
  try {
    localStorage.setItem(GRAPH_EXPLORER_MODE_KEY, value);
  } catch {
    /* storage unavailable */
  }
}

export function readGraphExplorerLayerDepth(): number {
  try {
    const raw = localStorage.getItem(GRAPH_EXPLORER_LAYER_DEPTH_KEY);
    if (raw !== null) return normalizeGraphExplorerLayerDepth(Number.parseInt(raw, 10));
    const legacy = localStorage.getItem(LEGACY_GRAPH_EXPLORER_LAYER_DEPTH_KEY);
    if (legacy !== null) return normalizeGraphExplorerLayerDepth(Number.parseInt(legacy, 10));
    return DEFAULT_GRAPH_EXPLORER_LAYER_DEPTH;
  } catch {
    return DEFAULT_GRAPH_EXPLORER_LAYER_DEPTH;
  }
}

export function normalizeGraphExplorerLayerDepth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRAPH_EXPLORER_LAYER_DEPTH;
  return Math.min(
    MAX_GRAPH_EXPLORER_LAYER_DEPTH,
    Math.max(MIN_GRAPH_EXPLORER_LAYER_DEPTH, Math.round(value)),
  );
}

export function writeGraphExplorerLayerDepth(value: number): void {
  try {
    localStorage.setItem(
      GRAPH_EXPLORER_LAYER_DEPTH_KEY,
      String(normalizeGraphExplorerLayerDepth(value)),
    );
  } catch {
    /* storage unavailable */
  }
}

export function readGraphExplorerRelativeDetail(layerDepth?: number): number {
  try {
    const depth = layerDepth ?? readGraphExplorerLayerDepth();
    const raw = localStorage.getItem(GRAPH_EXPLORER_RELATIVE_DETAIL_KEY);
    if (raw !== null) {
      return normalizeGraphExplorerRelativeDetail(Number.parseInt(raw, 10), depth);
    }
    const legacy = localStorage.getItem(LEGACY_GRAPH_EXPLORER_RELATIVE_DETAIL_KEY);
    if (legacy !== null) {
      return normalizeGraphExplorerRelativeDetail(Number.parseInt(legacy, 10), depth);
    }
    return normalizeGraphExplorerRelativeDetail(DEFAULT_GRAPH_EXPLORER_RELATIVE_DETAIL, depth);
  } catch {
    return normalizeGraphExplorerRelativeDetail(
      DEFAULT_GRAPH_EXPLORER_RELATIVE_DETAIL,
      layerDepth ?? DEFAULT_GRAPH_EXPLORER_LAYER_DEPTH,
    );
  }
}

export function writeGraphExplorerRelativeDetail(value: number, layerDepth?: number): void {
  try {
    const depth = layerDepth ?? readGraphExplorerLayerDepth();
    localStorage.setItem(
      GRAPH_EXPLORER_RELATIVE_DETAIL_KEY,
      String(normalizeGraphExplorerRelativeDetail(value, depth)),
    );
  } catch {
    /* storage unavailable */
  }
}
