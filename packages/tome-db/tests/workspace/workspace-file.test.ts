import { describe, expect, test } from "bun:test";
import {
  editorMarkdownBodyPanel,
  emptyWorkspaceFile,
  parseWorkspaceFile,
  serializeWorkspaceFile,
  WORKSPACE_FILE_VERSION,
} from "../../src/workspace/workspace-file";

const VALID = {
  version: 1,
  homeNodeId: "13458e628ba28073850dea0edb9acde1",
  archiveNodeId: "0f558a609a56485185beed4d1fd1cd9f",
  protectedNodeIds: [
    "13458e628ba28073850dea0edb9acde1",
    "0f558a609a56485185beed4d1fd1cd9f",
  ],
  graphExplorer: { defaultAnchorNodeId: "e028aa0786f5449984a4f497c1d746fa" },
  staticSite: { homeNodeId: "5bfc10918fa24207879d68a030927dd3" },
  sidebar: {
    links: [{ nodeId: "dd0de9867cc345b898929306bdf9fc83", label: "Features", icon: "★" }],
  },
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
    expect(file.sidebar.links).toHaveLength(1);
    expect(file.branding?.appTitle).toBe("Tome");
    expect(file.legacy?.archivePathPrefix).toBe("Marloth/Archive");
  });

  test("allows empty sidebar links", () => {
    const file = parseWorkspaceFile(
      JSON.stringify({ ...VALID, sidebar: { links: [] }, branding: undefined, legacy: undefined }),
    );
    expect(file.sidebar.links).toEqual([]);
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
});

describe("emptyWorkspaceFile", () => {
  test("returns valid minimal workspace for tests", () => {
    const file = emptyWorkspaceFile();
    expect(() => parseWorkspaceFile(serializeWorkspaceFile(file))).not.toThrow();
  });
});
