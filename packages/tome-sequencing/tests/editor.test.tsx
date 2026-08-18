import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SequencingBlockComponent } from "../src/editor";
import type { TimelineLayout } from "../src/layout";

const sampleLayout: TimelineLayout = {
  events: [
    {
      id: "e1",
      title: "Arc One",
      lane: 0,
      start: 0,
      end: 1,
    },
  ],
  depends: [],
  laneCount: 1,
  timeMin: 0,
  timeMax: 1,
};

const linkedLayout: TimelineLayout = {
  events: [
    { id: "e1", title: "Arc One", lane: 0, start: 0, end: 1 },
    { id: "e2", title: "Arc Two", lane: 1, start: 1, end: 2 },
    { id: "e3", title: "Arc Three", lane: 2, start: 2, end: 3 },
  ],
  depends: [{ prerequisiteId: "e1", dependentId: "e2", from: "end", to: "start" }],
  laneCount: 3,
  timeMin: 0,
  timeMax: 3,
};

describe("SequencingBlockComponent", () => {
  test("renders event link from arrange invoke", async () => {
    const invoke = async () => ({ ok: true, layout: sampleLayout });
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );

    await waitFor(() => {
      const link = document.querySelector("a.tome-sequencing-event-link");
      expect(link).toBeTruthy();
      expect(link?.getAttribute("href")).toContain("node=e1");
      expect(link?.textContent).toContain("Arc One");
    });
  });

  test("settings cog defaults dependency edges off and chronology units on", async () => {
    const invoke = async () => ({ ok: true, layout: sampleLayout });
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Timeline settings" })).toBeTruthy(),
    );
    expect(document.querySelector(".tome-sequencing-depends-edge")).toBeNull();
    expect(document.querySelector(".tome-sequencing-svg")).toBeTruthy();
  });

  test("enabling Show dependency edges draws cubic paths", async () => {
    const invoke = async () => ({ ok: true, layout: linkedLayout });
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );
    const trigger = await waitFor(() =>
      screen.getByRole("button", { name: "Timeline settings" }),
    );
    fireEvent.click(trigger);
    fireEvent.click(screen.getByLabelText("Show dependency edges"));
    const edge = await waitFor(() => document.querySelector("path.tome-sequencing-depends-edge"));
    expect(edge?.getAttribute("d") ?? "").toContain("C ");
  });

  test("Show dependency edges checkbox persists via user settings", async () => {
    const saved: boolean[] = [];
    const invoke = async () => ({ ok: true, layout: sampleLayout });
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
          getSequencingShowDependencyEdges: () => false,
          setSequencingShowDependencyEdges: async (value) => {
            saved.push(value);
          },
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );
    const trigger = await waitFor(() =>
      screen.getByRole("button", { name: "Timeline settings" }),
    );
    fireEvent.click(trigger);
    fireEvent.click(screen.getByLabelText("Show dependency edges"));
    expect(saved).toEqual([true]);
  });

  test("settings menu closes on outside click", async () => {
    const invoke = async () => ({ ok: true, layout: sampleLayout });
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );
    const trigger = await waitFor(() =>
      screen.getByRole("button", { name: "Timeline settings" }),
    );
    fireEvent.click(trigger);
    expect(document.querySelector(".tome-sequencing-settings-menu")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector(".tome-sequencing-settings-menu")).toBeNull();
  });

  test("graph parameter checkbox calls setBlockParameter and re-invokes", async () => {
    const setBlockParameter = async () => {};
    const calls: unknown[] = [];
    const invoke = async (input: unknown) => {
      calls.push(input);
      return { ok: true, layout: sampleLayout };
    };
    const blockData = {
      version: 1,
      reactFlow: {
        nodes: [
          {
            id: "includeConsiderations",
            type: "parameter",
            position: { x: 0, y: 0 },
            data: {
              inputValues: {
                label: "Include Consideration arcs",
                value: true,
              },
            },
          },
        ],
        edges: [],
      },
    };
    let paramStore: Record<string, boolean | null> = {};
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
          getBlockParameters: () => {
            const out: Record<string, boolean> = {};
            for (const [k, v] of Object.entries(paramStore)) {
              if (typeof v === "boolean") out[k] = v;
            }
            return out;
          },
          setBlockParameter: async (id, value) => {
            expect(id).toBe("includeConsiderations");
            paramStore = {
              ...paramStore,
              [id]: value as boolean | null,
            };
            await setBlockParameter();
          },
        }}
        blockData={blockData}
        onBlockDataChange={() => {}}
      />,
    );
    const trigger = await waitFor(() =>
      screen.getByRole("button", { name: "Timeline settings" }),
    );
    fireEvent.click(trigger);
    const checkbox = await waitFor(() =>
      screen.getByLabelText("Include Consideration arcs"),
    );
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    const before = calls.length;
    fireEvent.click(checkbox);
    await waitFor(() => expect(paramStore.includeConsiderations).toBe(false));
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    const last = calls[calls.length - 1] as { parameters?: { includeConsiderations?: boolean } };
    expect(last.parameters?.includeConsiderations).toBe(false);
  });

  test("re-arranges when block parameter settings revision changes after mount", async () => {
    const calls: unknown[] = [];
    const invoke = async (input: unknown) => {
      calls.push(input);
      return { ok: true, layout: sampleLayout };
    };
    const blockData = {
      version: 1,
      reactFlow: {
        nodes: [
          {
            id: "includeConsiderations",
            type: "parameter",
            position: { x: 0, y: 0 },
            data: {
              inputValues: {
                label: "Include Consideration arcs",
                value: true,
              },
            },
          },
        ],
        edges: [],
      },
    };
    let revision = 0;
    const { rerender } = render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
          getBlockParameters: () => ({ includeConsiderations: false }),
          getBlockParametersRevision: () => revision,
        }}
        blockData={blockData}
        onBlockDataChange={() => {}}
      />,
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const before = calls.length;
    revision = 1;
    rerender(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
          getBlockParameters: () => ({ includeConsiderations: false }),
          getBlockParametersRevision: () => revision,
        }}
        blockData={blockData}
        onBlockDataChange={() => {}}
      />,
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    const last = calls[calls.length - 1] as { parameters?: { includeConsiderations?: boolean } };
    expect(last.parameters?.includeConsiderations).toBe(false);
  });
});

async function eventLink(id: string): Promise<Element> {
  await waitFor(() => {
    expect(
      document.querySelector(`a.tome-sequencing-event-link[href*="node=${id}"]`),
    ).toBeTruthy();
  });
  return document.querySelector(`a.tome-sequencing-event-link[href*="node=${id}"]`)!;
}

describe("timeline dependency popup", () => {
  test("left click opens popup instead of navigating", async () => {
    const invoke = async () => ({ ok: true, layout: linkedLayout });
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );
    const link = await eventLink("e2");
    let documentSawClick = false;
    const onDocumentClick = () => {
      documentSawClick = true;
    };
    document.addEventListener("click", onDocumentClick);
    expect(fireEvent.click(link)).toBe(false);
    document.removeEventListener("click", onDocumentClick);
    expect(documentSawClick).toBe(false);
    expect(screen.getByRole("dialog", { name: "Dependencies for Arc Two" })).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Arc One");
    expect(screen.getByRole("dialog").textContent).toContain("end → start");
  });

  test("delete and add-via-pick invoke depends mutations and reopen the popup", async () => {
    const calls: unknown[] = [];
    let layout = linkedLayout;
    const invoke = async (input: unknown) => {
      calls.push(input);
      const record = input as {
        action?: string;
        prerequisiteId?: string;
        dependentId?: string;
        from?: string;
        to?: string;
      };
      if (record.action === "removeDepends") {
        layout = { ...layout, depends: [] };
      }
      if (record.action === "addDepends") {
        layout = {
          ...layout,
          depends: [
            ...layout.depends,
            {
              prerequisiteId: record.prerequisiteId!,
              dependentId: record.dependentId!,
              from: (record.from as "start" | "end") ?? "end",
              to: (record.to as "start" | "end") ?? "start",
            },
          ],
        };
      }
      return { ok: true, layout };
    };
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );
    fireEvent.click(await eventLink("e2"));
    fireEvent.click(screen.getByRole("button", { name: "Remove dependency Arc One end → start" }));
    await waitFor(() =>
      expect(calls.some((c) => (c as { action?: string }).action === "removeDepends")).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Add start dependency" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByText("Click a start or end to add a dependency")).toBeTruthy();
    expect(
      document.querySelector('a.tome-sequencing-event-link[href*="node=e3"]')?.textContent,
    ).toContain("Arc Three");

    fireEvent.click(screen.getByRole("button", { name: "Pick end of Arc Three" }));
    await waitFor(() =>
      expect(
        calls.some((c) => {
          const record = c as {
            action?: string;
            prerequisiteId?: string;
            dependentId?: string;
            from?: string;
            to?: string;
          };
          return (
            record.action === "addDepends" &&
            record.prerequisiteId === "e3" &&
            record.dependentId === "e2" &&
            record.from === "end" &&
            record.to === "start"
          );
        }),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Dependencies for Arc Two" })).toBeTruthy(),
    );
  });

  test("Cancel restores the popup without mutating", async () => {
    const calls: unknown[] = [];
    const invoke = async (input: unknown) => {
      calls.push(input);
      return { ok: true, layout: linkedLayout };
    };
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );
    fireEvent.click(await eventLink("e1"));
    fireEvent.click(screen.getByRole("button", { name: "Add start dependent" }));
    expect(screen.getByText("Click a start or end to add a dependent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Dependencies for Arc One" })).toBeTruthy();
    expect(calls.every((c) => (c as { action?: string }).action === "arrange")).toBe(true);
  });

  test("Escape restores the popup from pick mode", async () => {
    const invoke = async () => ({ ok: true, layout: linkedLayout });
    render(
      <SequencingBlockComponent
        ctx={{
          component: { id: "tome-sequencing.block", label: "Timeline" },
          nodeId: "01KWN86X6MFZQAJ1V36T9592A9",
          invoke,
        }}
        blockData={{ version: 1, reactFlow: { nodes: [], edges: [] } }}
        onBlockDataChange={() => {}}
      />,
    );
    fireEvent.click(await eventLink("e1"));
    fireEvent.click(screen.getByRole("button", { name: "Add start dependent" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Dependencies for Arc One" })).toBeTruthy();
  });
});
