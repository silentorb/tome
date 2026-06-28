import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  addWorkspaceQuickLink,
  isWorkspaceQuickLink,
  removeWorkspaceQuickLink,
  reorderWorkspaceQuickLinks,
} from "../../src/workspace/quick-links";
import { loadWorkspaceFromContent } from "../../src/workspace/load";
import { parseWorkspaceFile } from "../../src/workspace/workspace-file";
import { workspaceFilePath } from "../../src/content/paths";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestWorkspace,
} from "../../src/content/test-helpers";

const NODE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_NODE_ID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("workspace quick links", () => {
  test("addWorkspaceQuickLink appends entry with defaults", () => {
    const fixture = createTestContentFixture("tome-quick-link-add-");
    try {
      seedTestNode(fixture, {
        id: NODE_ID,
        properties: { title: "Features hub" },
      });
      seedTestWorkspace(fixture, {
        branding: { defaultDocumentIcon: "T" },
      });

      expect(addWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBeNull();

      const workspace = loadWorkspaceFromContent(fixture.ctx.store.contentDir);
      expect(workspace.quickLinks).toHaveLength(1);
      expect(workspace.quickLinks[0]).toEqual({
        nodeId: NODE_ID,
        label: "Features hub",
        icon: "T",
      });
      expect(isWorkspaceQuickLink(workspace, NODE_ID)).toBe(true);
    } finally {
      destroyTestContentFixture(fixture);
    }
  });

  test("addWorkspaceQuickLink accepts explicit label and icon", () => {
    const fixture = createTestContentFixture("tome-quick-link-add-custom-");
    try {
      seedTestNode(fixture, { id: NODE_ID, properties: { title: "Ignored" } });

      expect(
        addWorkspaceQuickLink(fixture.ctx, NODE_ID, { label: "Features", icon: "★" }),
      ).toBeNull();

      const workspace = loadWorkspaceFromContent(fixture.ctx.store.contentDir);
      expect(workspace.quickLinks[0]).toEqual({
        nodeId: NODE_ID,
        label: "Features",
        icon: "★",
      });
    } finally {
      destroyTestContentFixture(fixture);
    }
  });

  test("addWorkspaceQuickLink rejects missing node and duplicates", () => {
    const fixture = createTestContentFixture("tome-quick-link-errors-");
    try {
      expect(addWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBe("not_found");

      seedTestNode(fixture, { id: NODE_ID, properties: { title: "Page" } });
      expect(addWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBeNull();
      expect(addWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBe("already_exists");
    } finally {
      destroyTestContentFixture(fixture);
    }
  });

  test("removeWorkspaceQuickLink updates workspace.json", () => {
    const fixture = createTestContentFixture("tome-quick-link-remove-");
    try {
      seedTestNode(fixture, { id: NODE_ID, properties: { title: "Page" } });
      seedTestWorkspace(fixture, {
        quickLinks: [{ nodeId: NODE_ID, label: "Page", icon: "M" }],
      });

      expect(removeWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBeNull();

      const raw = readFileSync(workspaceFilePath(fixture.ctx.store.contentDir), "utf-8");
      const workspace = parseWorkspaceFile(raw);
      expect(workspace.quickLinks).toEqual([]);
      expect(removeWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBe("not_a_quick_link");
    } finally {
      destroyTestContentFixture(fixture);
    }
  });

  test("reorderWorkspaceQuickLinks reorders entries", () => {
    const fixture = createTestContentFixture("tome-quick-link-reorder-");
    try {
      seedTestWorkspace(fixture, {
        quickLinks: [
          { nodeId: NODE_ID, label: "First", icon: "1" },
          { nodeId: OTHER_NODE_ID, label: "Second", icon: "2" },
        ],
      });

      expect(
        reorderWorkspaceQuickLinks(fixture.ctx, [OTHER_NODE_ID, NODE_ID]),
      ).toBeNull();

      const workspace = loadWorkspaceFromContent(fixture.ctx.store.contentDir);
      expect(workspace.quickLinks.map((link) => link.nodeId)).toEqual([
        OTHER_NODE_ID,
        NODE_ID,
      ]);
      expect(reorderWorkspaceQuickLinks(fixture.ctx, [NODE_ID])).toBe("invalid_order");
    } finally {
      destroyTestContentFixture(fixture);
    }
  });
});
