import { describe, expect, test } from "bun:test";
import {
  editorMarkdownBodyPanel,
  emptyWorkspaceFile,
  parseWorkspaceFile,
  serializeWorkspaceFile,
  spatialGraphNodeDimensionScale,
  WORKSPACE_FILE_VERSION,
} from "../../src/workspace/workspace-file";

const VALID = {
  version: 1,
  homeNodeId: "00000000000000000000000005",
  archiveNodeId: "00000000000000000000000002",
  protectedNodeIds: [
    "00000000000000000000000005",
    "00000000000000000000000002",
  ],
  graphExplorer: { defaultAnchorNodeId: "0000000000000000000000002V" },
  staticSite: { homeNodeId: "0000000000000000000000000Y" },
  quickLinks: [{ nodeId: "0000000000000000000000002P", label: "Features", icon: "★" }],
  branding: { appTitle: "Tome" },
  legacy: { exportPathPrefix: "Marloth", archivePathPrefix: "Marloth/Archive" },
};

describe("parseWorkspaceFile", () => {
  test("parses valid workspace JSON", () => {
    const file = parseWorkspaceFile(JSON.stringify(VALID));
    expect(file.version).toBe(WORKSPACE_FILE_VERSION);
    expect(file.homeNodeId).toBe(VALID.homeNodeId);
    expect(file.archiveNodeId).toBe(VALID.archiveNodeId);
    expect(file.protectedNodeIds).toEqual(VALID.protectedNodeIds);
    expect(file.graphExplorer.defaultAnchorNodeId).toBe(VALID.graphExplorer.defaultAnchorNodeId);
    expect(file.staticSite.homeNodeId).toBe(VALID.staticSite.homeNodeId);
    expect(file.quickLinks).toHaveLength(1);
    expect(file.branding?.appTitle).toBe("Tome");
    expect(file.legacy?.archivePathPrefix).toBe("Marloth/Archive");
  });

  test("allows empty quick links", () => {
    const file = parseWorkspaceFile(
      JSON.stringify({ ...VALID, quickLinks: [], branding: undefined, legacy: undefined }),
    );
    expect(file.quickLinks).toEqual([]);
    expect(file.branding).toBeUndefined();
    expect(file.legacy).toBeUndefined();
  });

  test("rejects wrong version", () => {
    expect(() => parseWorkspaceFile(JSON.stringify({ ...VALID, version: 2 }))).toThrow(
      /unsupported version/,
    );
  });

  test("rejects invalid node id", () => {
    expect(() =>
      parseWorkspaceFile(JSON.stringify({ ...VALID, homeNodeId: "not-a-node-id" })),
    ).toThrow(/homeNodeId/);
  });

  test("rejects missing required fields", () => {
    const { graphExplorer: _g, ...missingGraph } = VALID;
    expect(() => parseWorkspaceFile(JSON.stringify(missingGraph))).toThrow(/graphExplorer/);
  });

  test("parses legacy sidebar.links into quickLinks", () => {
    const { quickLinks: _q, ...legacyShape } = VALID;
    const file = parseWorkspaceFile(
      JSON.stringify({
        ...legacyShape,
        sidebar: {
          links: [{ nodeId: "0000000000000000000000002P", label: "Features", icon: "★" }],
        },
      }),
    );
    expect(file.quickLinks).toHaveLength(1);
    expect(file.quickLinks[0]?.label).toBe("Features");
  });

  test("serialize writes quickLinks not sidebar", () => {
    const file = parseWorkspaceFile(JSON.stringify(VALID));
    const serialized = serializeWorkspaceFile(file);
    expect(serialized).toContain('"quickLinks"');
    expect(serialized).not.toContain('"sidebar"');
  });

  test("serialize round-trips", () => {
    const file = parseWorkspaceFile(JSON.stringify(VALID));
    const roundTrip = parseWorkspaceFile(serializeWorkspaceFile(file));
    expect(roundTrip).toEqual(file);
  });

  test("parses static site footer branding fields", () => {
    const file = parseWorkspaceFile(
      JSON.stringify({
        ...VALID,
        branding: {
          staticSiteFooter: "© :year: :organization:",
          staticSiteFooterOrganization: "Silent Orb",
        },
      }),
    );
    expect(file.branding?.staticSiteFooter).toBe("© :year: :organization:");
    expect(file.branding?.staticSiteFooterOrganization).toBe("Silent Orb");
  });

  test("treats whitespace-only footer fields as unset", () => {
    const file = parseWorkspaceFile(
      JSON.stringify({
        ...VALID,
        branding: {
          appTitle: "Tome",
          staticSiteFooter: "   ",
          staticSiteFooterOrganization: "  ",
        },
      }),
    );
    expect(file.branding?.appTitle).toBe("Tome");
    expect(file.branding?.staticSiteFooter).toBeUndefined();
    expect(file.branding?.staticSiteFooterOrganization).toBeUndefined();
  });

  test("parses optional editor.markdownBodyPanel", () => {
    const enabled = parseWorkspaceFile(
      JSON.stringify({ ...VALID, editor: { markdownBodyPanel: true } }),
    );
    expect(enabled.editor?.markdownBodyPanel).toBe(true);
    expect(editorMarkdownBodyPanel(enabled)).toBe(true);

    const disabled = parseWorkspaceFile(
      JSON.stringify({ ...VALID, editor: { markdownBodyPanel: false } }),
    );
    expect(disabled.editor?.markdownBodyPanel).toBe(false);
    expect(editorMarkdownBodyPanel(disabled)).toBe(false);

    const omitted = parseWorkspaceFile(JSON.stringify(VALID));
    expect(omitted.editor).toBeUndefined();
    expect(editorMarkdownBodyPanel(omitted)).toBe(false);
  });

  test("rejects invalid editor.markdownBodyPanel type", () => {
    expect(() =>
      parseWorkspaceFile(JSON.stringify({ ...VALID, editor: { markdownBodyPanel: "yes" } })),
    ).toThrow(/markdownBodyPanel/);
  });

  test("parses optional spatialGraph.nodeDimensionScale", () => {
    const file = parseWorkspaceFile(
      JSON.stringify({
        ...VALID,
        spatialGraph: { nodeDimensionScale: { x: 1.75, y: 1.25 } },
      }),
    );
    expect(file.spatialGraph?.nodeDimensionScale).toEqual({ x: 1.75, y: 1.25 });
    expect(spatialGraphNodeDimensionScale(file)).toEqual({ x: 1.75, y: 1.25 });
  });

  test("omits spatialGraph when section is absent", () => {
    const file = parseWorkspaceFile(JSON.stringify(VALID));
    expect(file.spatialGraph).toBeUndefined();
    expect(spatialGraphNodeDimensionScale(file)).toBeUndefined();
  });

  test("rejects invalid spatialGraph.nodeDimensionScale axis", () => {
    expect(() =>
      parseWorkspaceFile(
        JSON.stringify({
          ...VALID,
          spatialGraph: { nodeDimensionScale: { x: 0 } },
        }),
      ),
    ).toThrow(/nodeDimensionScale\.x/);
  });
});

describe("emptyWorkspaceFile", () => {
  test("returns valid minimal workspace for tests", () => {
    const file = emptyWorkspaceFile();
    expect(() => parseWorkspaceFile(serializeWorkspaceFile(file))).not.toThrow();
  });
});
