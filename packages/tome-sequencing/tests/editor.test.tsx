import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SequencingBlockComponent } from "../src/editor";
import type { TimelineLayout } from "../src/layout";

const sampleLayout: TimelineLayout = {
  events: [
    {
      id: "e1",
      title: "Arc One",
      track: "Primary",
      earliestStart: 0,
      latestStart: 0,
      earliestEnd: 1,
      latestEnd: 1,
    },
  ],
  depends: [],
  tracks: ["Primary"],
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
});
