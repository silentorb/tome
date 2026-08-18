import { describe, expect, test } from "bun:test";
import { buildTimelineLayoutFromResolved, type TimelineLayout } from "../src/layout";
import { renderTimelineStaticHtml, renderTimelineStaticSvg } from "../src/static-svg";

const sampleLayout: TimelineLayout = {
  events: [
    {
      id: "e1",
      title: "Arc One",
      lane: 0,
      start: 0,
      end: 2,
    },
    {
      id: "e2",
      title: "Arc Two",
      lane: 0,
      start: 2,
      end: 4,
    },
  ],
  depends: [{ prerequisiteId: "e1", dependentId: "e2", from: "end", to: "start" }],
  laneCount: 1,
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
    expect(svg).toContain('fill="#1f6b75"');
    expect(svg).toContain('fill="#12151a"');
    expect(svg).not.toContain("tome-sequencing-event-range");
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

  test("overlapping ASAP events get distinct bar y positions", () => {
    const layout = buildTimelineLayoutFromResolved({
      resolved: [
        {
          id: "e1",
          earliestStart: 0,
          latestStart: 0,
          earliestEnd: 2,
          latestEnd: 4,
        },
        {
          id: "e2",
          earliestStart: 0,
          latestStart: 0,
          earliestEnd: 2,
          latestEnd: 4,
        },
      ],
      titles: new Map([
        ["e1", "Arc One"],
        ["e2", "Arc Two"],
      ]),
      depends: [],
    });
    expect(layout.events.map((e) => e.lane).sort()).toEqual([0, 1]);
    expect(layout.laneCount).toBe(2);

    const svg = renderTimelineStaticSvg(layout);
    const ys = [...svg.matchAll(/class="tome-sequencing-event-core"[^>]*\sy="([\d.]+)"/g)].map(
      (m) => Number(m[1]),
    );
    expect(ys).toHaveLength(2);
    expect(ys[0]).not.toBe(ys[1]);
  });

  test("long-slack event does not occlude later event in SVG (single ASAP bars)", () => {
    const layout = buildTimelineLayoutFromResolved({
      resolved: [
        {
          id: "ocean",
          earliestStart: 0,
          latestStart: 4,
          earliestEnd: 1,
          latestEnd: 5,
        },
        {
          id: "wizards",
          earliestStart: 3,
          latestStart: 3,
          earliestEnd: 4,
          latestEnd: 4,
        },
      ],
      titles: new Map([
        ["ocean", "Ocean liner"],
        ["wizards", "Wizards tame the chaos"],
      ]),
      depends: [],
    });
    const svg = renderTimelineStaticSvg(layout);
    expect(svg).toContain("Ocean liner");
    expect(svg).toContain("Wizards tame the chaos");
    expect(svg).not.toContain("tome-sequencing-event-range");
  });
});
