import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaultBlockData } from "../src/config";

mock.module("../src/query-editor", () => ({
  QueryFlowEditor: () => <div data-testid="query-flow-stub" />,
}));

const { QueryBlockComponent } = await import("../src/editor");

const baseCtx = {
  component: { id: "tome-query.block", label: "Query table" },
  nodeId: "node-1",
};

describe("QueryBlockComponent", () => {
  test("renders Table and Query mode tabs", () => {
    render(
      <QueryBlockComponent
        ctx={baseCtx}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    expect(screen.getByRole("tab", { name: "Table" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Query" })).toBeTruthy();
  });

  test("Table mode auto-invokes and renders result columns and rows", async () => {
    const invoke = mock(async () => ({
      ok: true,
      columns: ["id", "title"],
      rows: [{ id: "n1", title: "Alpha" }],
    }));

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });
    expect(screen.getByText("id")).toBeTruthy();
    expect(screen.getByText("title")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("1 row")).toBeTruthy();
  });

  test("shows error when invoke returns ok: false", async () => {
    const invoke = mock(async () => ({
      ok: false,
      error: "Compile failed",
    }));

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      const field = screen.getByLabelText("Query error") as HTMLTextAreaElement;
      expect(field.readOnly).toBe(true);
      expect(field.value).toBe("Compile failed");
    });
  });

  test("error field mousedown clears ancestor draggable so text can be selected", async () => {
    const invoke = mock(async () => ({
      ok: false,
      error: "Compile failed",
    }));

    const dragShell = document.createElement("div");
    dragShell.draggable = true;
    document.body.appendChild(dragShell);

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
      { container: dragShell },
    );

    const field = await waitFor(() => screen.getByLabelText("Query error"));
    expect(dragShell.draggable).toBe(true);

    fireEvent.mouseDown(field);
    expect(dragShell.draggable).toBe(false);

    fireEvent.mouseUp(window);
    expect(dragShell.draggable).toBe(true);

    dragShell.remove();
  });

  test("shows message when invoke is missing", async () => {
    render(
      <QueryBlockComponent
        ctx={baseCtx}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      const field = screen.getByLabelText("Query error") as HTMLTextAreaElement;
      expect(field.readOnly).toBe(true);
      expect(field.value).toBe("Query invoke is not available");
    });
  });

  test("Refresh re-invokes the query", async () => {
    const invoke = mock(async () => ({
      ok: true,
      columns: ["id"],
      rows: [{ id: "n1" }],
    }));

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(2);
    });
  });

  test("Query mode shows flow stub and hides table panel", async () => {
    const invoke = mock(async () => ({
      ok: true,
      columns: ["id"],
      rows: [],
    }));

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Query" }));

    expect(screen.getByTestId("query-flow-stub")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });
});
