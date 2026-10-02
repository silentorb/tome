import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  addWorkspaceQuickLink,
  isWorkspaceQuickLink,
  removeWorkspaceQuickLink,
  reorderWorkspaceQuickLinks,
} from "../../src/workspace/quick-links";
import { loadWorkspaceFromContent } from "tome-flatfile";
import { parseWorkspaceFile } from "tome-flatfile";
import { workspaceFilePath } from "tome-flatfile";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestWorkspace,
} from "../../src/content/test-helpers";

const NODE_ID = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_NODE_ID = "BBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("workspace quick links", async () => {
  test("addWorkspaceQuickLink appends entry with defaults", async () => {
    const fixture = await createTestContentFixture("tome-quick-link-add-");
    try {
      await seedTestNode(fixture, {
        id: NODE_ID,
        properties: { title: "Features hub" },
      });
      seedTestWorkspace(fixture, {
        branding: { defaultDocumentIcon: "T" },
      });

      expect(await addWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBeNull();

      const workspace = loadWorkspaceFromContent(fixture.ctx.store.contentDir);
      expect(workspace.quickLinks).toHaveLength(1);
      expect(workspace.quickLinks[0]).toEqual({
        nodeId: NODE_ID,
        label: "Features hub",
      });
      expect(isWorkspaceQuickLink(workspace, NODE_ID)).toBe(true);
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });

  test("addWorkspaceQuickLink accepts explicit label", async () => {
    const fixture = await createTestContentFixture("tome-quick-link-add-custom-");
    try {
      await seedTestNode(fixture, { id: NODE_ID, properties: { title: "Ignored" } });

      expect(
        await addWorkspaceQuickLink(fixture.ctx, NODE_ID, { label: "Features" }),
      ).toBeNull();

      const workspace = loadWorkspaceFromContent(fixture.ctx.store.contentDir);
      expect(workspace.quickLinks[0]).toEqual({
        nodeId: NODE_ID,
        label: "Features",
      });
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });

  test("addWorkspaceQuickLink rejects missing node and duplicates", async () => {
    const fixture = await createTestContentFixture("tome-quick-link-errors-");
    try {
      expect(await addWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBe("not_found");

      await seedTestNode(fixture, { id: NODE_ID, properties: { title: "Page" } });
      expect(await addWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBeNull();
      expect(await addWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBe("already_exists");
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });

  test("removeWorkspaceQuickLink updates workspace.json", async () => {
    const fixture = await createTestContentFixture("tome-quick-link-remove-");
    try {
      await seedTestNode(fixture, { id: NODE_ID, properties: { title: "Page" } });
      seedTestWorkspace(fixture, {
        quickLinks: [{ nodeId: NODE_ID, label: "Page" }],
      });

      expect(await removeWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBeNull();

      const raw = readFileSync(workspaceFilePath(fixture.ctx.store.contentDir), "utf-8");
      const workspace = parseWorkspaceFile(raw);
      expect(workspace.quickLinks).toEqual([]);
      expect(await removeWorkspaceQuickLink(fixture.ctx, NODE_ID)).toBe("not_a_quick_link");
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });

  test("reorderWorkspaceQuickLinks reorders entries", async () => {
    const fixture = await createTestContentFixture("tome-quick-link-reorder-");
    try {
      seedTestWorkspace(fixture, {
        quickLinks: [
          { nodeId: NODE_ID, label: "First" },
          { nodeId: OTHER_NODE_ID, label: "Second" },
        ],
      });

      expect(
        await reorderWorkspaceQuickLinks(fixture.ctx, [OTHER_NODE_ID, NODE_ID]),
      ).toBeNull();

      const workspace = loadWorkspaceFromContent(fixture.ctx.store.contentDir);
      expect(workspace.quickLinks.map((link) => link.nodeId)).toEqual([
        OTHER_NODE_ID,
        NODE_ID,
      ]);
      expect(await reorderWorkspaceQuickLinks(fixture.ctx, [NODE_ID])).toBe("invalid_order");
    } finally {
      await destroyTestContentFixture(fixture);
    }
  });
});
