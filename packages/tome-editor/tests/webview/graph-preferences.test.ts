import { beforeEach, describe, expect, test } from "bun:test";
import {
  GRAPH_EXPLORER_LAYER_DEPTH_KEY,
  GRAPH_EXPLORER_MODE_KEY,
  GRAPH_EXPLORER_RELATIVE_DETAIL_KEY,
  GRAPH_SHOW_NODE_LABELS_KEY,
  GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY,
  LEGACY_GRAPH_EXPLORER_LAYER_DEPTH_KEY,
  LEGACY_GRAPH_EXPLORER_MODE_KEY,
  LEGACY_GRAPH_EXPLORER_RELATIVE_DETAIL_KEY,
  LEGACY_GRAPH_SHOW_NODE_LABELS_KEY,
  LEGACY_GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY,
  DEFAULT_GRAPH_EXPLORER_LAYER_DEPTH,
  DEFAULT_GRAPH_EXPLORER_RELATIVE_DETAIL,
  readGraphExplorerLayerDepth,
  readGraphExplorerMode,
  readGraphExplorerRelativeDetail,
  readGraphShowNodeLabels,
  readGraphShowRelevanceDiagnostics,
  writeGraphExplorerLayerDepth,
  writeGraphExplorerMode,
  writeGraphExplorerRelativeDetail,
  writeGraphShowNodeLabels,
  writeGraphShowRelevanceDiagnostics,
  normalizeGraphExplorerLayerDepth,
  normalizeGraphExplorerRelativeDetail,
} from "../../src/webview/graph-preferences";

const ALL_KEYS = [
  GRAPH_SHOW_NODE_LABELS_KEY,
  GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY,
  GRAPH_EXPLORER_MODE_KEY,
  GRAPH_EXPLORER_LAYER_DEPTH_KEY,
  GRAPH_EXPLORER_RELATIVE_DETAIL_KEY,
  LEGACY_GRAPH_SHOW_NODE_LABELS_KEY,
  LEGACY_GRAPH_SHOW_RELEVANCE_DIAGNOSTICS_KEY,
  LEGACY_GRAPH_EXPLORER_MODE_KEY,
  LEGACY_GRAPH_EXPLORER_LAYER_DEPTH_KEY,
  LEGACY_GRAPH_EXPLORER_RELATIVE_DETAIL_KEY,
];

describe("graph preferences", () => {
  beforeEach(() => {
    for (const key of ALL_KEYS) {
      localStorage.removeItem(key);
    }
  });

  test("read/write show node labels", () => {
    expect(readGraphShowNodeLabels()).toBe(false);
    writeGraphShowNodeLabels(true);
    expect(readGraphShowNodeLabels()).toBe(true);
    expect(localStorage.getItem(GRAPH_SHOW_NODE_LABELS_KEY)).toBe("1");
    expect(localStorage.getItem(LEGACY_GRAPH_SHOW_NODE_LABELS_KEY)).toBeNull();
    writeGraphShowNodeLabels(false);
    expect(readGraphShowNodeLabels()).toBe(false);
  });

  test("read/write relevance diagnostics", () => {
    expect(readGraphShowRelevanceDiagnostics()).toBe(false);
    writeGraphShowRelevanceDiagnostics(true);
    expect(readGraphShowRelevanceDiagnostics()).toBe(true);
    writeGraphShowRelevanceDiagnostics(false);
    expect(readGraphShowRelevanceDiagnostics()).toBe(false);
  });

  test("read/write explorer mode", () => {
    expect(readGraphExplorerMode()).toBe("layers");
    writeGraphExplorerMode("relative");
    expect(readGraphExplorerMode()).toBe("relative");
    expect(localStorage.getItem(GRAPH_EXPLORER_MODE_KEY)).toBe("relative");
    expect(localStorage.getItem(LEGACY_GRAPH_EXPLORER_MODE_KEY)).toBeNull();
    writeGraphExplorerMode("layers");
    expect(readGraphExplorerMode()).toBe("layers");
  });

  test("read/write layer depth with normalization", () => {
    expect(readGraphExplorerLayerDepth()).toBe(DEFAULT_GRAPH_EXPLORER_LAYER_DEPTH);
    writeGraphExplorerLayerDepth(5);
    expect(readGraphExplorerLayerDepth()).toBe(5);
    expect(normalizeGraphExplorerLayerDepth(99)).toBe(10);
    expect(normalizeGraphExplorerLayerDepth(1)).toBe(2);
  });

  test("read/write relative detail clamped to layer depth", () => {
    expect(readGraphExplorerRelativeDetail(3)).toBe(DEFAULT_GRAPH_EXPLORER_RELATIVE_DETAIL);
    writeGraphExplorerRelativeDetail(3, 3);
    expect(readGraphExplorerRelativeDetail(3)).toBe(3);
    writeGraphExplorerLayerDepth(2);
    expect(readGraphExplorerRelativeDetail()).toBe(2);
    expect(normalizeGraphExplorerRelativeDetail(9, 3)).toBe(3);
    expect(normalizeGraphExplorerRelativeDetail(0, 3)).toBe(1);
  });

  test("reads legacy localStorage key when new key absent", () => {
    localStorage.setItem(LEGACY_GRAPH_SHOW_NODE_LABELS_KEY, "1");
    localStorage.setItem(LEGACY_GRAPH_EXPLORER_MODE_KEY, "relative");
    localStorage.setItem(LEGACY_GRAPH_EXPLORER_LAYER_DEPTH_KEY, "5");

    expect(readGraphShowNodeLabels()).toBe(true);
    expect(readGraphExplorerMode()).toBe("relative");
    expect(readGraphExplorerLayerDepth()).toBe(5);
  });

  test("new key takes precedence over legacy key", () => {
    localStorage.setItem(LEGACY_GRAPH_SHOW_NODE_LABELS_KEY, "1");
    localStorage.setItem(GRAPH_SHOW_NODE_LABELS_KEY, "0");

    expect(readGraphShowNodeLabels()).toBe(false);
  });
});
