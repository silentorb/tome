import { describe, expect, test } from "bun:test";
import {
  parseWorkspaceFile,
  schemaDiagramMemberBadgePosition,
  schemaDiagramPageBlockServices,
} from "../src/workspace/workspace-file";

const BASE_WORKSPACE = {
  version: 1,
  homeNodeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  archiveNodeId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  protectedNodeIds: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  graphExplorer: { defaultAnchorNodeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  staticSite: { homeNodeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  quickLinks: [],
};

describe("workspace schemaDiagram", () => {
  test("parseWorkspaceFile accepts memberBadgePosition", () => {
    const workspace = parseWorkspaceFile(
      JSON.stringify({
        ...BASE_WORKSPACE,
        schemaDiagram: { memberBadgePosition: "top-left" },
      }),
    );
    expect(workspace.schemaDiagram?.memberBadgePosition).toBe("top-left");
    expect(schemaDiagramMemberBadgePosition(workspace)).toBe("top-left");
    expect(schemaDiagramPageBlockServices(workspace)).toEqual({
      memberBadgePosition: "top-left",
    });
  });

  test("defaults member badge position to bottom-right", () => {
    const workspace = parseWorkspaceFile(JSON.stringify(BASE_WORKSPACE));
    expect(schemaDiagramMemberBadgePosition(workspace)).toBe("bottom-right");
  });

  test("rejects invalid memberBadgePosition", () => {
    expect(() =>
      parseWorkspaceFile(
        JSON.stringify({
          ...BASE_WORKSPACE,
          schemaDiagram: { memberBadgePosition: "center" },
        }),
      ),
    ).toThrow(/memberBadgePosition/);
  });
});
