import type { GraphLodSnapshot } from "../../../src/shared/types";

export function makeGraphLodSnapshot(
  overrides: Partial<GraphLodSnapshot> = {},
): GraphLodSnapshot {
  const anchorId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const neighborId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  return {
    layerCount: 2,
    levels: [
      {
        nodes: [
          {
            id: anchorId,
            title: "Anchor node",
            group: "Anchor",
            labels: ["Anchor"],
          },
        ],
        relationships: [],
      },
      {
        nodes: [
          {
            id: anchorId,
            title: "Anchor node",
            group: "Anchor",
            labels: ["Anchor"],
          },
          {
            id: neighborId,
            title: "Neighbor node",
            group: "Neighbor",
            labels: ["Neighbor"],
          },
        ],
        relationships: [
          {
            id: "connection-anchor-neighbor",
            source: anchorId,
            target: neighborId,
            type: "related",
          },
        ],
      },
    ],
    ...overrides,
  };
}
