import { describe, expect, test } from "bun:test";
import {
  canDrillDownLayer,
  canDrillUpLayer,
  clusterGatewayId,
  defaultExplorerLayerIndex,
  explorerInteractionHint,
  explorerToolbarTitle,
  graphLodLayerLabel,
  isDrillableClusterNode,
  isOpenableGraphNode,
  nextExplorerLayerIndex,
  previousExplorerLayerIndex,
  relativeExplorerLayerIndex,
  resolveAnchorTitleFromSnapshot,
} from "../../src/webview/graph-lod";

describe("graph LOD navigation", () => {
  test("defaultExplorerLayerIndex starts at coarsest layer", () => {
    expect(defaultExplorerLayerIndex(5)).toBe(0);
  });

  test("layer drill helpers move within bounds", () => {
    expect(canDrillDownLayer(0, 5)).toBe(true);
    expect(canDrillDownLayer(4, 5)).toBe(false);
    expect(canDrillUpLayer(0)).toBe(false);
    expect(canDrillUpLayer(2)).toBe(true);
    expect(nextExplorerLayerIndex(0, 5)).toBe(1);
    expect(nextExplorerLayerIndex(4, 5)).toBe(4);
    expect(previousExplorerLayerIndex(2)).toBe(1);
    expect(previousExplorerLayerIndex(0)).toBe(0);
  });

  test("graphLodLayerLabel reflects layer index", () => {
    expect(graphLodLayerLabel(0, 5)).toBe("Layer 1/5");
    expect(graphLodLayerLabel(4, 5)).toBe("Layer 5/5");
  });

  test("isDrillableClusterNode identifies cluster nodes", () => {
    expect(isDrillableClusterNode({ isCluster: true })).toBe(true);
    expect(isDrillableClusterNode({})).toBe(false);
  });

  test("isOpenableGraphNode rejects cluster nodes", () => {
    expect(isOpenableGraphNode({ id: "aaaa0001", isCluster: true })).toBe(false);
    expect(isOpenableGraphNode({ id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).toBe(true);
  });

  test("clusterGatewayId reads bundle gateway id", () => {
    expect(clusterGatewayId({ isCluster: true, bundle: { gatewayId: "abc123" } })).toBe("abc123");
    expect(clusterGatewayId({ isCluster: true })).toBeNull();
  });

  test("relative mode uses configured detail layer", () => {
    expect(relativeExplorerLayerIndex(5, 1)).toBe(0);
    expect(relativeExplorerLayerIndex(5, 2)).toBe(1);
    expect(relativeExplorerLayerIndex(3, 3)).toBe(2);
  });

  test("explorerInteractionHint reflects mode", () => {
    expect(explorerInteractionHint("relative", 0, 5)).toBe("Click clusters to explore branches");
    expect(explorerInteractionHint("layers", 0, 5)).toBe("Click cluster nodes to drill down");
    expect(explorerInteractionHint("layers", 4, 5)).toBe("Click nodes to open records");
  });

  test("explorerToolbarTitle reflects mode", () => {
    expect(explorerToolbarTitle("layers", { layerIndex: 0, layerCount: 5 })).toBe(
      "Graph Explorer · Layer 1/5",
    );
    expect(explorerToolbarTitle("relative", { anchorTitle: "James", layerIndex: 1, layerCount: 3 })).toBe(
      "Graph Explorer · James · Layer 2/3",
    );
  });

  test("resolveAnchorTitleFromSnapshot finds anchor title", () => {
    const snapshot = {
      nodes: [
        {
          id: "branch:abc",
          title: "James",
          isCluster: true,
          bundle: { gatewayId: "abc", gatewayTitle: "James", memberCount: 3, layer: 1, layerCount: 5 },
          labels: ["GraphCluster"],
          path: null,
        },
      ],
      relationships: [],
    };
    expect(resolveAnchorTitleFromSnapshot(snapshot, "abc")).toBe("James");
  });
});
