import { describe, expect, test } from "bun:test";
import type { TimelineLayout } from "../src/layout";
import { renderTimelineStaticHtml, renderTimelineStaticSvg } from "../src/static-svg";

const sampleLayout: TimelineLayout = {
  events: [
    {
      id: "e1",
      title: "Arc One",
      track: "Primary",
      earliestStart: 0,
      latestStart: 0,
      earliestEnd: 2,
      latestEnd: 3,
    },
    {
      id: "e2",
      title: "Arc Two",
      track: "Secondary",
      earliestStart: 2,
      latestStart: 2,
      earliestEnd: 4,
      latestEnd: 4,
    },
  ],
  depends: [{ prerequisiteId: "e1", dependentId: "e2" }],
  tracks: ["Primary", "Secondary"],
  timeMin: 0,
  timeMax: 4,
};

describe("renderTimelineStaticSvg", () => {
  test("emits timeline SVG with event links, not a text list", () => {
    const svg = renderTimelineStaticSvg(sampleLayout);
    expect(svg).toContain("<svg");
    expect(svg).toContain('class="tome-sequencing-svg"');
    expect(svg).toContain("Arc One");
    expect(svg).toContain("node=e1");
    expect(svg).not.toContain("<ul");
    expect(svg).not.toContain("tome-sequencing-static-list");
  });

  test("html wrapper is a figure with canvas, not a static-list ul", () => {
    const html = renderTimelineStaticHtml(sampleLayout);
    expect(html).toContain('class="tome-sequencing-block"');
    expect(html).toContain("tome-sequencing-canvas");
    expect(html).toContain("<svg");
    expect(html).toContain("2 events");
    expect(html).not.toContain("tome-sequencing-static-list");
  });
});
