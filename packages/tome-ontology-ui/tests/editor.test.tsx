import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { defaultBlockData } from "../src/config";

mock.module("tome-react-flow/editor", () => ({
  ImpFlowEditor: () => <div data-testid="imp-flow-stub" />,
  impFlowDeleteKeyCode: () => null,
}));

const { NodeFilterBlockComponent, register } = await import("../src/editor");

describe("NodeFilterBlockComponent", () => {
  test("shows summary and opens tool panel on Edit filter", () => {
    const openToolPanel = mock((session: { title: string }) => {
      void session;
    });
    render(
      <NodeFilterBlockComponent
        ctx={{
          component: { id: "tome-ontology-ui", label: "Node filter" },
          nodeId: "node-1",
          openToolPanel,
        }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    expect(screen.getByText(/1 operator/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit filter" }));
    expect(openToolPanel).toHaveBeenCalledTimes(1);
    expect(openToolPanel.mock.calls[0]![0].title).toBe("Edit node filter");
  });

  test("register installs interactive page block", () => {
    const registerPageBlock = mock((spec: { implementationId: string; interactive: boolean }) => {
      void spec;
    });
    register({ registerPageBlock } as never);
    expect(registerPageBlock).toHaveBeenCalledTimes(1);
    expect(registerPageBlock.mock.calls[0]![0].implementationId).toBe("tome-ontology-ui");
    expect(registerPageBlock.mock.calls[0]![0].interactive).toBe(true);
  });
});
