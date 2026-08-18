import { describe, expect, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { SequencingBlockComponent } from "../src/editor";
import type { TimelineLayout } from "../src/layout";
import {
  LANE_HEIGHT,
  buildLaneYLayout,
  timelineSvgHeight,
} from "../src/timeline";

const concurrentLayout: TimelineLayout = {
  events: [
    {
      id: "e1",
      title: "A",
      lane: 0,
      start: 0,
      end: 1,
    },
    {
      id: "e2",
      title: "B",
      lane: 1,
      start: 0,
      end: 1,
    },
    {
      id: "e3",
      title: "C",
      lane: 2,
      start: 0,
      end: 1,
    },
  ],
  depends: [],
  laneCount: 3,
  timeMin: 0,
  timeMax: 1,
};

describe("timeline layout height", () => {
  test("buildLaneYLayout sizes content from lane count", () => {
    const y = buildLaneYLayout(concurrentLayout);
    expect(y.laneCount).toBe(3);
    expect(y.contentHeight).toBe(3 * LANE_HEIGHT);
    expect(y.eventY(0)).toBe(0);
    expect(y.eventY(2)).toBe(2 * LANE_HEIGHT);
  });

  test("timelineSvgHeight is margins plus content", () => {
    expect(timelineSvgHeight(40, true)).toBe(16 + 36 + 40);
    expect(timelineSvgHeight(40, false)).toBe(16 + 12 + 40);
  });

  test("interactive SVG height matches content, not a fixed viewport", async () => {
    const invoke = async () => ({ ok: true, layout: concurrentLayout });
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

    const expected = timelineSvgHeight(
      buildLaneYLayout(concurrentLayout).contentHeight,
      true,
    );
    await waitFor(() => {
      const svg = document.querySelector("svg.tome-sequencing-svg");
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute("height")).toBe(String(expected));
    });
  });
});
