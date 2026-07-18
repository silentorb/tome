import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import { defaultReactFlowGraph } from "../src/config";

const reactFlowProps: { deleteKeyCode?: unknown }[] = [];

mock.module("@xyflow/react", () => ({
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  ReactFlow: (props: { deleteKeyCode?: unknown }) => {
    reactFlowProps.push(props);
    return <div data-testid="react-flow-stub" />;
  },
  addEdge: () => [],
  applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  useEdgesState: (initial: unknown) => [initial, mock(() => {})],
  useNodesState: (initial: unknown) => [initial, mock(() => {})],
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
}));

mock.module("../src/imp-nodes", () => ({
  createOperatorNode: () => ({ id: "n", type: "filter", position: { x: 0, y: 0 }, data: {} }),
  listPaletteNodeTypes: () => [],
  useImpNodeTypes: () => ({}),
}));

const { QueryFlowEditor } = await import("../src/query-editor");

describe("QueryFlowEditor", () => {
  test("binds Backspace and Delete to remove selected nodes", () => {
    reactFlowProps.length = 0;
    render(
      <QueryFlowEditor
        graph={defaultReactFlowGraph()}
        onGraphChange={() => {}}
      />,
    );

    expect(reactFlowProps.at(-1)?.deleteKeyCode).toEqual(["Backspace", "Delete"]);
  });

  test("disables delete keys when read-only", () => {
    reactFlowProps.length = 0;
    render(
      <QueryFlowEditor
        graph={defaultReactFlowGraph()}
        readOnly
        onGraphChange={() => {}}
      />,
    );

    expect(reactFlowProps.at(-1)?.deleteKeyCode).toBeNull();
  });
});
