import { mock, describe, expect, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import { makeGraphLodSnapshot } from "../test-fixtures/graph-lod";

const forceGraphRenderSpy = mock((_props: unknown) => null);

mock.module("../../../src/webview/graph-canvas-size", () => ({
  measureCanvasSize: () => ({ width: 800, height: 600 }),
  canRenderCanvas2d: () => true,
}));

mock.module("react-force-graph-2d", () => ({
  default: (props: { width: number; height: number; graphData: { nodes: unknown[] } }) => {
    forceGraphRenderSpy(props);
    return (
      <div
        data-testid="force-graph"
        data-width={props.width}
        data-height={props.height}
        data-node-count={props.graphData.nodes.length}
      />
    );
  },
}));

const { GraphView } = await import("../../../src/webview/components/GraphView");

function renderGraphView(
  overrides: Partial<Parameters<typeof GraphView>[0]> = {},
) {
  const api = {
    ...makeMockEditorApi(),
    getGraphExplorerLod: async () => makeGraphLodSnapshot(),
    ...overrides.api,
  };

  return render(
    <GraphView
      api={api}
      explorerMode="layers"
      onExplorerModeChange={() => {}}
      layerDepth={3}
      onLayerDepthChange={() => {}}
      relativeDetail={2}
      onRelativeDetailChange={() => {}}
      canNavigateAnchorBack={false}
      onNavigateAnchorBack={() => {}}
      onAnchorChange={() => {}}
      showNodeLabels={false}
      onShowNodeLabelsChange={() => {}}
      showRelevanceDiagnostics={false}
      onShowRelevanceDiagnosticsChange={() => {}}
      onOpenNode={() => {}}
      {...overrides}
    />,
  );
}

describe("GraphView", () => {
  test("renders toolbar and mounts force graph after LOD data loads", async () => {
    forceGraphRenderSpy.mockClear();

    const { container } = renderGraphView();

    await waitFor(() => {
      expect(container.textContent).toMatch(/\d+ nodes · \d+ relationships/);
    });

    expect(container.querySelector(".tome-graph-canvas")).toBeTruthy();

    await waitFor(() => {
      expect(container.querySelector('[data-testid="force-graph"]')).toBeTruthy();
    });

    const graph = container.querySelector('[data-testid="force-graph"]')!;
    expect(Number(graph.getAttribute("data-width"))).toBeGreaterThan(0);
    expect(Number(graph.getAttribute("data-height"))).toBeGreaterThan(0);
    expect(Number(graph.getAttribute("data-node-count"))).toBe(1);
    expect(forceGraphRenderSpy).toHaveBeenCalled();
  });

  test("shows an error when LOD fetch fails", async () => {
    const { container } = renderGraphView({
      api: {
        ...makeMockEditorApi(),
        getGraphExplorerLod: async () => {
          throw new Error("network down");
        },
      },
    });

    await waitFor(() => {
      expect(container.querySelector(".tome-graph-error")?.textContent).toBe("network down");
    });
  });

  test("shows a canvas error when 2D rendering is unavailable", async () => {
    mock.module("../../../src/webview/graph-canvas-size", () => ({
      measureCanvasSize: () => ({ width: 800, height: 600 }),
      canRenderCanvas2d: () => false,
    }));

    const { GraphView: GraphViewFresh } = await import("../../../src/webview/components/GraphView");
    const api = {
      ...makeMockEditorApi(),
      getGraphExplorerLod: async () => makeGraphLodSnapshot(),
    };

    const { container } = render(
      <GraphViewFresh
        api={api}
        explorerMode="layers"
        onExplorerModeChange={() => {}}
        layerDepth={3}
        onLayerDepthChange={() => {}}
        relativeDetail={2}
        onRelativeDetailChange={() => {}}
        canNavigateAnchorBack={false}
        onNavigateAnchorBack={() => {}}
        onAnchorChange={() => {}}
        showNodeLabels={false}
        onShowNodeLabelsChange={() => {}}
        showRelevanceDiagnostics={false}
        onShowRelevanceDiagnosticsChange={() => {}}
        onOpenNode={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".tome-graph-error")?.textContent).toBe(
        "Canvas rendering is unavailable.",
      );
    });
  });
});
