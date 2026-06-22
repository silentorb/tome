import { describe, expect, test } from "bun:test";
import { buildPlacements, buildSpatialGraphElements } from "../src/build-elements";
import { defaultSpatialGraphBlockData, parseSpatialGraphConfig } from "../src/config";

describe("parseSpatialGraphConfig", () => {
  test("uses code defaults when data is empty", () => {
    const config = parseSpatialGraphConfig({});
    expect(config.relationships.parentTypes).toEqual(["parents"]);
    expect(config.relationships.neighborTypes).toEqual(["neighbor"]);
    expect(config.parentHeaderHeight).toBe(28);
  });

  test("reads local block data overrides", () => {
    const config = parseSpatialGraphConfig({
      relationships: {
        parentTypes: ["contains"],
        neighborTypes: ["adjacent"],
      },
    });
    expect(config.relationships.parentTypes).toEqual(["contains"]);
    expect(config.relationships.neighborTypes).toEqual(["adjacent"]);
  });

  test("defaultSpatialGraphBlockData matches parser defaults", () => {
    const config = parseSpatialGraphConfig(defaultSpatialGraphBlockData());
    expect(config.relationships.parentTypes).toEqual(["parents"]);
  });
});

describe("buildSpatialGraphElements", () => {
  const nodes = [
    { id: "city-a", title: "City A" },
    { id: "city-b", title: "City B" },
    { id: "house", title: "House" },
  ];

  test("multi-parent node produces duplicated placements", () => {
    const config = parseSpatialGraphConfig({});
    const edges = [
      { id: "p1", sourceId: "house", targetId: "city-a", type: "parents" },
      { id: "p2", sourceId: "house", targetId: "city-b", type: "parents" },
    ];
    const elements = buildSpatialGraphElements(nodes, edges, config);
    const houseNodes = elements.filter(
      (element) => element.group === "nodes" && element.data.canonicalId === "house",
    );
    expect(houseNodes).toHaveLength(2);
    expect(houseNodes.map((node) => node.data.parent).sort()).toEqual(["city-a", "city-b"]);
  });

  test("neighbor edges expand across placement pairs", () => {
    const config = parseSpatialGraphConfig({});
    const edges = [
      { id: "p1", sourceId: "house", targetId: "city-a", type: "parents" },
      { id: "p2", sourceId: "house", targetId: "city-b", type: "parents" },
      { id: "n1", sourceId: "city-a", targetId: "city-b", type: "neighbor" },
    ];
    const elements = buildSpatialGraphElements(nodes, edges, config);
    const graphEdges = elements.filter((element) => element.group === "edges");
    expect(graphEdges.length).toBe(1);
  });
});

describe("buildPlacements", () => {
  test("child duplicates under each parent placement", () => {
    const nodes = [
      { id: "region", title: "Region" },
      { id: "city-a", title: "City A" },
      { id: "city-b", title: "City B" },
      { id: "house", title: "House" },
    ];
    const parentMap = new Map<string, Set<string>>([
      ["city-a", new Set(["region"])],
      ["city-b", new Set(["region"])],
      ["house", new Set(["city-a", "city-b"])],
    ]);
    const placements = buildPlacements(nodes, parentMap);
    const housePlacements = placements.filter((placement) => placement.canonicalId === "house");
    expect(housePlacements).toHaveLength(2);
    expect(housePlacements.every((placement) => placement.parentElementId?.startsWith("city-"))).toBe(
      true,
    );
  });
});
