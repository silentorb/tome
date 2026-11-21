import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { defaultBlockData, defaultImpGraph } from "../src/config";
import { QueryBlockComponent } from "../src/editor";

const baseCtx = {
  component: { id: "query", label: "Query table" },
  nodeId: "node-1",
};

describe("QueryBlockComponent", () => {
  test("renders Edit query and Refresh controls", () => {
    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, openToolPanel: () => {} }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit query" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  test("auto-invokes and renders result columns and rows", async () => {
    const invoke = mock(async () => ({
      ok: true,
      columns: ["title"],
      rows: [{ id: "n1", title: "Alpha" }],
    }));

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke, openToolPanel: () => {} }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });
    expect(screen.getByText("title")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Alpha" }) as HTMLAnchorElement;
    expect(link.href).toContain("node=n1");
    expect(link.className).toContain("tome-query-title-link");
    expect(screen.getByText("1 row")).toBeTruthy();
  });

  test("shows error when invoke returns ok: false", async () => {
    const invoke = mock(async () => ({
      ok: false,
      error: "Compile failed",
    }));

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke, openToolPanel: () => {} }}
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
        ctx={{ ...baseCtx, invoke, openToolPanel: () => {} }}
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
        ctx={{ ...baseCtx, openToolPanel: () => {} }}
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
        ctx={{ ...baseCtx, invoke, openToolPanel: () => {} }}
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

  test("Edit query opens the host tool panel with Imp graph props", async () => {
    const invoke = mock(async () => ({ ok: true, columns: ["id"], rows: [] }));
    type OpenedSession = {
      title: string;
      props: Record<string, unknown>;
      onClose?: () => void;
    };
    let opened: OpenedSession | null = null;
    const openToolPanel = mock((session: OpenedSession) => {
      opened = session;
    });

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke, openToolPanel }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit query" }));

    await waitFor(() => {
      expect(openToolPanel).toHaveBeenCalledTimes(1);
    });
    expect(opened).not.toBeNull();
    expect(opened!.title).toBe("Edit query");
    expect(opened!.props.graph).toEqual(defaultImpGraph());
    expect(typeof opened!.props.onGraphChange).toBe("function");
    expect(typeof opened!.props.onLayoutChange).toBe("function");
    expect(opened!.props.pathHopOptions).toBeUndefined();
  });

  test("panel onClose re-runs the query", async () => {
    const invoke = mock(async () => ({
      ok: true,
      columns: ["id"],
      rows: [],
    }));
    let onClose: (() => void) | undefined;
    const openToolPanel = mock(
      (session: { onClose?: () => void }) => {
        onClose = session.onClose;
      },
    );

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke, openToolPanel }}
        blockData={defaultBlockData()}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit query" }));
    await waitFor(() => {
      expect(onClose).toBeDefined();
    });
    onClose!();

    await waitFor(() => {
      // mount execute + onClose execute
      expect(invoke).toHaveBeenCalledTimes(2);
    });
  });

  test("graph change from panel persists Imp graph + layout", async () => {
    const invoke = mock(async () => ({
      ok: true,
      columns: ["id"],
      rows: [],
    }));
    const calls: unknown[] = [];
    let onGraphChange: ((graph: unknown) => void) | undefined;
    const openToolPanel = mock(
      (session: { props: Record<string, unknown> }) => {
        onGraphChange = session.props.onGraphChange as (graph: unknown) => void;
      },
    );

    render(
      <QueryBlockComponent
        ctx={{ ...baseCtx, invoke, openToolPanel }}
        blockData={defaultBlockData()}
        onBlockDataChange={(data) => {
          calls.push(data);
        }}
      />,
    );

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit query" }));
    await waitFor(() => {
      expect(onGraphChange).toBeDefined();
    });
    const nextGraph = {
      nodes: {
        in: { id: "in", type: "input", inputs: {} },
      },
      edges: {},
    };
    onGraphChange?.(nextGraph);

    expect(calls.length).toBeGreaterThan(0);
    const last = calls.at(-1) as { graph?: unknown; layout?: unknown; viewMode?: unknown };
    expect(last.graph).toEqual(nextGraph);
    expect(last.layout).toBeDefined();
    expect(last.viewMode).toBeUndefined();
  });
});
