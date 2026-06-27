import { describe, expect, test } from "bun:test";
import { buildSpatialGraphElements } from "../src/build-elements";
import { parseSpatialGraphConfig, resolveSpatialGraphConfig } from "../src/config";
import { buildSpatialGraphStylesheet } from "../src/layout-svg";

describe("buildSpatialGraphStylesheet", () => {
  test("scales node geometry but not font sizes", () => {
    const config = resolveSpatialGraphConfig({}, { nodeDimensionScale: { x: 2, y: 1.5 } });
    const styles = buildSpatialGraphStylesheet(config);
    const nodeStyle = styles.find((entry) => entry.selector === "node")?.style;
    const parentStyle = styles.find((entry) => entry.selector === ":parent")?.style;

    expect(nodeStyle?.width).toBe(80);
    expect(nodeStyle?.height).toBe(60);
    expect(nodeStyle?.["text-max-width"]).toBe(80);
    expect(nodeStyle?.["font-size"]).toBe(10);

    expect(parentStyle?.["font-size"]).toBe(11);
    expect(parentStyle?.["text-max-width"]).toBe(120);
    expect(parentStyle?.["padding-left"]).toBe(32);
    expect(parentStyle?.["padding-bottom"]).toBe(24);
  });

  test("ties leaf text-max-width to node width at each scale", () => {
    const at2x = resolveSpatialGraphConfig({}, { nodeDimensionScale: { x: 2, y: 1 } });
    const nodeStyle = buildSpatialGraphStylesheet(at2x).find((entry) => entry.selector === "node")
      ?.style;
    expect(nodeStyle?.width).toBe(nodeStyle?.["text-max-width"]);
  });

  test("uses baseline dimensions at default scale", () => {
    const config = parseSpatialGraphConfig({});
    const nodeStyle = buildSpatialGraphStylesheet(config).find((entry) => entry.selector === "node")
      ?.style;

    expect(nodeStyle?.width).toBe(40);
    expect(nodeStyle?.height).toBe(40);
    expect(nodeStyle?.["text-max-width"]).toBe(40);
    expect(nodeStyle?.["font-size"]).toBe(10);
  });
});

describe("layoutSpatialGraphSvg", () => {
  test("returns svg markup for a small compound graph", async () => {
    const { layoutSpatialGraphSvg } = await import("../src/layout-svg");
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

  test("adds clickable node overlays using provided href resolver", async () => {
    const { layoutSpatialGraphSvg } = await import("../src/layout-svg");
    const config = parseSpatialGraphConfig({});
    const elements = buildSpatialGraphElements(
      [
        { id: "city-a", title: "City A" },
        { id: "city-b", title: "City B" },
      ],
      [{ id: "n1", sourceId: "city-a", targetId: "city-b", type: "neighbor" }],
      config,
    );

    const svg = await layoutSpatialGraphSvg(elements, config, (nodeId) => `/nodes/${nodeId}/`);
    expect(svg).toContain('class="tome-spatial-graph-node-links"');
    expect(svg).toContain('class="tome-spatial-graph-node-link"');
    expect(svg).toContain('href="/nodes/city-a/"');
    expect(svg).toContain('href="/nodes/city-b/"');
    expect(svg).toContain('data-node-id="city-a"');
  });

  test("exports neighbor edge stroke for compound siblings (James/Corridor under Asylum)", async () => {
    const { layoutSpatialGraphSvg } = await import("../src/layout-svg");
    const config = parseSpatialGraphConfig({
      layout: { randomize: false },
    });
    const elements = buildSpatialGraphElements(
      [
        { id: "city", title: "City" },
        { id: "asylum", title: "Asylum" },
        { id: "james", title: "James" },
        { id: "corridor", title: "Corridor" },
      ],
      [
        { id: "p1", sourceId: "asylum", targetId: "city", type: "parents" },
        { id: "p2", sourceId: "james", targetId: "asylum", type: "parents" },
        { id: "p3", sourceId: "corridor", targetId: "asylum", type: "parents" },
        { id: "n1", sourceId: "james", targetId: "corridor", type: "neighbor" },
      ],
      config,
    );

    const svg = await layoutSpatialGraphSvg(elements, config);
    expect(svg).toMatch(/stroke="rgb\(160,174,192\)"/);
  });

  test("concurrent renders do not clear document mid-export", async () => {
    const { layoutSpatialGraphSvg } = await import("../src/layout-svg");
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
