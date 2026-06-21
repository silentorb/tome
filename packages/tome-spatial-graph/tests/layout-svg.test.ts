import { describe, expect, test } from "bun:test";
import { buildSpatialGraphElements } from "../src/build-elements";
import { parseSpatialGraphConfig } from "../src/config";
import { layoutSpatialGraphSvg } from "../src/layout-svg";

describe("layoutSpatialGraphSvg", () => {
  test("returns svg markup for a small compound graph", async () => {
    const config = parseSpatialGraphConfig({});
    const elements = buildSpatialGraphElements(
      [
        { id: "city-a", title: "City A" },
        { id: "city-b", title: "City B" },
        { id: "house", title: "House" },
      ],
      [
        { id: "p1", sourceId: "house", targetId: "city-a", type: "parents" },
        { id: "n1", sourceId: "city-a", targetId: "city-b", type: "neighbor" },
      ],
      config,
    );

    const svg = await layoutSpatialGraphSvg(elements, config);
    expect(svg).toContain("<svg");
    expect(svg).toContain("City A");
  });

  test("concurrent renders do not clear document mid-export", async () => {
    const config = parseSpatialGraphConfig({});
    const elements = buildSpatialGraphElements(
      [
        { id: "city-a", title: "City A" },
        { id: "city-b", title: "City B" },
      ],
      [{ id: "n1", sourceId: "city-a", targetId: "city-b", type: "neighbor" }],
      config,
    );

    const [first, second] = await Promise.all([
      layoutSpatialGraphSvg(elements, config),
      layoutSpatialGraphSvg(elements, config),
    ]);

    expect(first).toContain("<svg");
    expect(second).toContain("<svg");
  });
});
