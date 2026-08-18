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
    // Chronology axis is present by default (visx bottom axis text).
    expect(document.querySelector(".tome-sequencing-svg")).toBeTruthy();
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
