import { describe, expect, test } from "bun:test";
import { formatNodeHoverLabel, formatNodeHoverLines } from "../../src/webview/graph-node-label";

describe("formatNodeHoverLabel", () => {
  test("returns title only when diagnostics disabled", () => {
    expect(
      formatNodeHoverLabel(
        {
          title: "Scene A",
          relevance: {
            score: 1.2,
            hop: 1,
            degree: 4,
            directNeighbor: true,
            hopContribution: 0.5,
            degreeContribution: 0.2,
            directBonus: 0.5,
            rank: 2,
            promoted: true,
          },
        },
        false,
      ),
    ).toBe("Scene A");
  });

  test("includes relevance key-value lines when diagnostics enabled", () => {
    const label = formatNodeHoverLabel(
      {
        title: "Scene A",
        relevance: {
          score: 1.234,
          hop: 2,
          degree: 8,
          directNeighbor: false,
          hopContribution: 0.333,
          degreeContribution: 0.589,
          directBonus: 0,
          rank: 12,
          promoted: true,
        },
      },
      true,
    );

    expect(label).toContain("Scene A");
    expect(label).toContain("score: 1.234");
    expect(label).toContain("hop: 2");
    expect(label).toContain("rank: 12");
    expect(label).toContain("promoted: true");
  });

  test("formatNodeHoverLines splits diagnostic lines", () => {
    const lines = formatNodeHoverLines(
      {
        title: "Scene A",
        relevance: {
          score: 1.2,
          hop: 1,
          degree: 4,
          directNeighbor: true,
          hopContribution: 0.5,
          degreeContribution: 0.2,
          directBonus: 0.5,
          rank: 2,
          promoted: true,
        },
      },
      true,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toBe("Scene A");
  });

  test("includes bundle diagnostics for cluster nodes", () => {
    const label = formatNodeHoverLabel(
      {
        title: "Feature X",
        isCluster: true,
        val: 24,
        bundle: {
          memberCount: 24,
          gatewayId: "abc",
          gatewayTitle: "Feature X",
          layer: 2,
          layerCount: 5,
        },
      },
      true,
    );

    expect(label).toContain("Feature X");
    expect(label).not.toContain("Feature X (24)");
    expect(label).toContain("members: 24");
    expect(label).toContain("gateway: Feature X");
    expect(label).toContain("layer: 2/5");
  });
});
