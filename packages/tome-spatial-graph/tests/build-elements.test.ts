import { describe, expect, test } from "bun:test";
import {
  buildParentMap,
  buildPlacements,
  buildSpatialGraphElements,
  shouldConnectNeighborPlacements,
} from "../src/build-elements";
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

  test("ignores children edges when node already has parents-type edges", () => {
    const config = parseSpatialGraphConfig({});
    const locationNodes = [
      { id: "unmarket", title: "The Unmarket" },
      { id: "book-shop", title: "Book shop" },
      { id: "city", title: "The City of Orphans" },
    ];
    const edges = [
      { id: "p1", sourceId: "book-shop", targetId: "city", type: "parents" },
      { id: "c1", sourceId: "unmarket", targetId: "book-shop", type: "children" },
    ];

    const parentMap = buildParentMap(locationNodes, edges, config);
    expect([...(parentMap.get("book-shop") ?? [])]).toEqual(["city"]);

    const elements = buildSpatialGraphElements(locationNodes, edges, config);
    const bookShopPlacements = elements.filter(
      (element) => element.group === "nodes" && element.data.canonicalId === "book-shop",
    );
    expect(bookShopPlacements).toHaveLength(1);
    expect(bookShopPlacements[0]?.data.parent).toBe("city");
  });

  test("still uses children edges when node has no parents-type edges", () => {
    const config = parseSpatialGraphConfig({});
    const nodes = [
      { id: "region-a", title: "Region A" },
      { id: "region-b", title: "Region B" },
      { id: "site", title: "Site" },
    ];
    const edges = [
      { id: "c1", sourceId: "region-a", targetId: "site", type: "children" },
      { id: "c2", sourceId: "region-b", targetId: "site", type: "children" },
    ];

    const parentMap = buildParentMap(nodes, edges, config);
    expect([...(parentMap.get("site") ?? [])].sort()).toEqual(["region-a", "region-b"]);
  });

  test("nested sibling neighbors produce one edge under shared parent", () => {
    const config = parseSpatialGraphConfig({});
    const locationNodes = [
      { id: "empire", title: "Empire" },
      { id: "city", title: "City" },
      { id: "shop-a", title: "Shop A" },
      { id: "shop-b", title: "Shop B" },
    ];
    const edges = [
      { id: "p1", sourceId: "city", targetId: "empire", type: "parents" },
      { id: "p2", sourceId: "shop-a", targetId: "city", type: "parents" },
      { id: "p3", sourceId: "shop-b", targetId: "city", type: "parents" },
      { id: "n1", sourceId: "shop-a", targetId: "shop-b", type: "neighbor" },
    ];

    const elements = buildSpatialGraphElements(locationNodes, edges, config);
    const graphEdges = elements.filter((element) => element.group === "edges");
    expect(graphEdges).toHaveLength(1);
    expect(graphEdges[0]?.data.source).toBe("shop-a@city@empire");
    expect(graphEdges[0]?.data.target).toBe("shop-b@city@empire");
  });

  test("multi-parent neighbor does not create cross-path edges", () => {
    const config = parseSpatialGraphConfig({});
    const locationNodes = [
      { id: "city-a", title: "City A" },
      { id: "city-b", title: "City B" },
      { id: "asylum", title: "The Asylum" },
      { id: "neighbor", title: "Neighbor Spot" },
    ];
    const edges = [
      { id: "p1", sourceId: "asylum", targetId: "city-a", type: "parents" },
      { id: "p2", sourceId: "asylum", targetId: "city-b", type: "parents" },
      { id: "n1", sourceId: "asylum", targetId: "neighbor", type: "neighbor" },
    ];

    const elements = buildSpatialGraphElements(locationNodes, edges, config);
    const graphEdges = elements.filter((element) => element.group === "edges");
    expect(graphEdges).toHaveLength(2);
    const pairs = graphEdges.map((edge) => `${edge.data.source}|${edge.data.target}`).sort();
    expect(pairs).toEqual(["asylum@city-a|neighbor", "asylum@city-b|neighbor"].sort());
  });
});

describe("shouldConnectNeighborPlacements", () => {
  test("connects siblings under the same parent", () => {
    expect(
      shouldConnectNeighborPlacements(
        { elementId: "a@city", canonicalId: "a", title: "A", parentElementId: "city" },
        { elementId: "b@city", canonicalId: "b", title: "B", parentElementId: "city" },
      ),
    ).toBe(true);
  });

  test("connects when at least one placement is root-level", () => {
    expect(
      shouldConnectNeighborPlacements(
        { elementId: "city-a", canonicalId: "city-a", title: "City A" },
        { elementId: "city-b", canonicalId: "city-b", title: "City B" },
      ),
    ).toBe(true);
  });

  test("skips placements under different parents", () => {
    expect(
      shouldConnectNeighborPlacements(
        { elementId: "asylum@city-a", canonicalId: "asylum", title: "Asylum", parentElementId: "city-a" },
        { elementId: "neighbor@city-b", canonicalId: "neighbor", title: "Neighbor", parentElementId: "city-b" },
      ),
    ).toBe(false);
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
