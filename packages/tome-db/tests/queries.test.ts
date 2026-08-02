import { describe, expect, test, afterAll } from "bun:test";
import { updateOutgoingRelationshipProperty } from "../src/relationship-property-update";
import {
  getNodeDetail,
  listRecentNodesByModifiedAt,
  searchNodes,
  updateNodeBody,
  updateNodeTitle,
} from "../src/queries";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
  seedTestCompositeRelationships,
  TEST_ARCHIVE_NODE_ID,
  TEST_RELATED_ASSOCIATION_ID,
  projectionTypeForEndpoint,
} from "../src/content/test-helpers";

describe("queries", () => {
  const fixture = createTestContentFixture("tome-db-queries-");

  test("getNodeDetail returns title and body", () => {
    seedTestNode(fixture, {
      id: "00000000000000000000000001",
      properties: {
        title: "Alpha",
        body: "# Hello",
      },
    });
    const detail = getNodeDetail(fixture.ctx.cache, "00000000000000000000000001");
    expect(detail?.id).toBe("00000000000000000000000001");
    expect(detail?.title).toBe("Alpha");
    expect(detail?.body.trimEnd()).toBe("# Hello");
    expect(detail?.primaryTypeTitle).toBeNull();
  });

  test("searchNodes matches title prefix", () => {
    seedTestNode(fixture, {
      id: "00000000000000000000000004",
      properties: { title: "Beta Record" },
    });
    const hits = searchNodes(fixture.ctx.cache, "Beta", 10);
    expect(hits.some((h) => h.id === "00000000000000000000000004")).toBe(true);
  });

  test("searchNodes ranks exact title matches before longer substring matches", () => {
    const exactId = "0000000000000000000000001T";
    const longerId = "00000000000000000000000024";
    seedTestNode(fixture, {
      id: exactId,
      properties: { title: "Surreal" },
    });
    seedTestNode(fixture, {
      id: longerId,
      properties: { title: "Applied Surrealism" },
    });

    const hits = searchNodes(fixture.ctx.cache, "Surreal", 10);
    expect(hits.map((row) => row.id)).toEqual([exactId, longerId]);
  });

  test("searchNodes with includeBody lists title matches before body-only matches", () => {
    const titleMatchId = "0000000000000000000000002F";
    const bodyOnlyId = "0000000000000000000000002R";
    seedTestNode(fixture, {
      id: titleMatchId,
      properties: {
        title: "Surreal Title Match",
        body: "no marker here",
      },
    });
    seedTestNode(fixture, {
      id: bodyOnlyId,
      properties: {
        title: "Unrelated",
        body: "contains surreal-body-marker text",
      },
    });

    const hits = searchNodes(fixture.ctx.cache, "surreal", 10, undefined, {
      includeBody: true,
    });
    expect(hits.map((row) => row.id).indexOf(titleMatchId)).toBeLessThan(
      hits.map((row) => row.id).indexOf(bodyOnlyId),
    );
  });

  test("searchNodes matches body when includeBody is enabled", () => {
    const bodyOnlyId = "0000000000000000000000000N";
    seedTestNode(fixture, {
      id: bodyOnlyId,
      properties: {
        title: "Unrelated Title",
        body: "unique-body-marker-xyz",
      },
    });
    const titleOnly = searchNodes(fixture.ctx.cache, "unique-body-marker", 10);
    expect(titleOnly.some((h) => h.id === bodyOnlyId)).toBe(false);

    const withBody = searchNodes(fixture.ctx.cache, "unique-body-marker", 10, undefined, {
      includeBody: true,
    });
    expect(withBody.some((h) => h.id === bodyOnlyId)).toBe(true);
  });

  test("searchNodes attaches matchPreview for body matches when includeBody is enabled", () => {
    const bodyOnlyId = "0000000000000000000000000Q";
    seedTestNode(fixture, {
      id: bodyOnlyId,
      properties: {
        title: "Another Unrelated Title",
        body: "prefix unique-preview-marker suffix",
      },
    });
    const hits = searchNodes(fixture.ctx.cache, "unique-preview-marker", 10, undefined, {
      includeBody: true,
    });
    const hit = hits.find((h) => h.id === bodyOnlyId);
    expect(hit).toBeDefined();
    expect(hit?.matchPreview).toBeDefined();
    expect(
      hit?.matchPreview?.parts.some((p) => p.highlight && p.text.includes("unique-preview-marker")),
    ).toBe(true);
  });

  test("searchNodes omits matchPreview for title-only matches", () => {
    const titleOnlyId = "0000000000000000000000000W";
    seedTestNode(fixture, {
      id: titleOnlyId,
      properties: {
        title: "title-only-marker-node",
        body: "body without the search term",
      },
    });
    const hits = searchNodes(fixture.ctx.cache, "title-only-marker", 10, undefined, {
      includeBody: true,
    });
    const hit = hits.find((h) => h.id === titleOnlyId);
    expect(hit).toBeDefined();
    expect(hit?.matchPreview).toBeUndefined();
  });

  test("searchNodes with allowedTypeIds returns title-ordered eligible nodes up to limit", () => {
    const featuresDbId = "11111111111111111111111111";
    const alphaId = "22222222222222222222222222";
    const betaId = "33333333333333333333333333";
    const zetaId = "44444444444444444444444444";
    const outsiderId = "55555555555555555555555555";

    seedTestNode(fixture, { id: featuresDbId, properties: { title: "Features" } });
    seedTestNode(fixture, { id: alphaId, properties: { title: "Alpha Feature" } });
    seedTestNode(fixture, { id: betaId, properties: { title: "Beta Feature" } });
    seedTestNode(fixture, { id: zetaId, properties: { title: "Zeta Feature" } });
    seedTestNode(fixture, { id: outsiderId, properties: { title: "AAA Other" } });
    seedTestRelationships(fixture, [
      { source: alphaId, target: featuresDbId, type: "member_of" },
      { source: betaId, target: featuresDbId, type: "member_of" },
      { source: zetaId, target: featuresDbId, type: "member_of" },
    ]);

    const hits = searchNodes(fixture.ctx.cache, "", 2, [featuresDbId]);
    expect(hits.map((row) => row.title)).toEqual(["Alpha Feature", "Beta Feature"]);
  });

  test("updateNodeBody persists markdown", () => {
    seedTestNode(fixture, {
      id: "0000000000000000000000000E",
      properties: { title: "Gamma", body: "old" },
    });
    expect(updateNodeBody(fixture.ctx, "0000000000000000000000000E", "new body")).toBe(true);
    expect(getNodeDetail(fixture.ctx.cache, "0000000000000000000000000E")?.body.trimEnd()).toBe(
      "new body",
    );
  });

  test("updateNodeTitle rejects empty and Untitled", () => {
    seedTestNode(fixture, {
      id: "0000000000000000000000000F",
      properties: { title: "Keep me", body: "body" },
    });
    expect(updateNodeTitle(fixture.ctx, "0000000000000000000000000F", "")).toBe(false);
    expect(updateNodeTitle(fixture.ctx, "0000000000000000000000000F", "Untitled")).toBe(false);
    expect(getNodeDetail(fixture.ctx.cache, "0000000000000000000000000F")?.title).toBe("Keep me");
    expect(updateNodeTitle(fixture.ctx, "0000000000000000000000000F", "Renamed")).toBe(true);
    expect(getNodeDetail(fixture.ctx.cache, "0000000000000000000000000F")?.title).toBe("Renamed");
  });

  test("listRecentNodesByModifiedAt orders by modified_at descending", () => {
    const olderId = "00000000000000000000000011";
    const newerId = "00000000000000000000000016";
    seedTestNode(fixture, {
      id: olderId,
      properties: {
        title: "Older",
        modified_at: "2024-01-01T00:00:00.000Z",
      },
    });
    seedTestNode(fixture, {
      id: newerId,
      properties: {
        title: "Newer",
        modified_at: "2024-06-01T00:00:00.000Z",
      },
    });

    const recent = listRecentNodesByModifiedAt(fixture.ctx.cache, 10);
    const olderIndex = recent.findIndex((row) => row.id === olderId);
    const newerIndex = recent.findIndex((row) => row.id === newerId);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  test("listRecentNodesByModifiedAt omits nodes without modified_at", () => {
    const withTimestamp = "0000000000000000000000001A";
    const withoutTimestamp = "0000000000000000000000001B";
    seedTestNode(fixture, {
      id: withTimestamp,
      properties: {
        title: "Has Timestamp",
        modified_at: "2024-03-01T00:00:00.000Z",
      },
    });
    seedTestNode(fixture, {
      id: withoutTimestamp,
      properties: { title: "No Timestamp" },
    });

    const recent = listRecentNodesByModifiedAt(fixture.ctx.cache, 100);
    expect(recent.some((row) => row.id === withTimestamp)).toBe(true);
    expect(recent.some((row) => row.id === withoutTimestamp)).toBe(false);
  });

  test("listRecentNodesByModifiedAt ignores relationship property updates", () => {
    const pageId = "0000000000000000000000001V";
    const targetId = "00000000000000000000000027";
    seedTestNode(fixture, {
      id: pageId,
      properties: {
        title: "Page",
        modified_at: "2024-01-01T00:00:00.000Z",
      },
    });
    seedTestNode(fixture, {
      id: targetId,
      properties: {
        title: "Target",
        modified_at: "2024-06-01T00:00:00.000Z",
      },
    });
    seedTestCompositeRelationships(fixture, [
      {
        a: pageId,
        b: targetId,
        typeFromA: "Related",
        typeFromB: "Related",
        associationId: TEST_RELATED_ASSOCIATION_ID,
        properties: { priority: "Low" },
      },
    ]);

    const before = listRecentNodesByModifiedAt(fixture.ctx.cache, 10);
    const pageIndexBefore = before.findIndex((row) => row.id === pageId);
    const targetIndexBefore = before.findIndex((row) => row.id === targetId);
    expect(pageIndexBefore).toBeGreaterThan(targetIndexBefore);

    expect(
      updateOutgoingRelationshipProperty(
        fixture.ctx,
        pageId,
        targetId,
        projectionTypeForEndpoint(TEST_RELATED_ASSOCIATION_ID, 0),
        "priority",
        "High",
      ),
    ).toBeNull();

    const after = listRecentNodesByModifiedAt(fixture.ctx.cache, 10);
    expect(after.findIndex((row) => row.id === pageId)).toBe(pageIndexBefore);
    expect(after.findIndex((row) => row.id === targetId)).toBe(targetIndexBefore);
  });

  test("listRecentNodesByModifiedAt excludes archived nodes", () => {
    const activeId = "0000000000000000000000002H";
    const archivedId = "0000000000000000000000002S";
    seedTestNode(fixture, {
      id: TEST_ARCHIVE_NODE_ID,
      properties: { title: "Archive" },
    });
    seedTestNode(fixture, {
      id: activeId,
      properties: {
        title: "Active",
        modified_at: "2024-02-01T00:00:00.000Z",
      },
    });
    seedTestNode(fixture, {
      id: archivedId,
      properties: {
        title: "Archived",
        modified_at: "2024-08-01T00:00:00.000Z",
      },
    });
    seedTestRelationships(fixture, [
      { source: archivedId, target: TEST_ARCHIVE_NODE_ID, type: "member_of" },
    ]);

    const recent = listRecentNodesByModifiedAt(fixture.ctx.cache, 100);
    expect(recent.some((row) => row.id === activeId)).toBe(true);
    expect(recent.some((row) => row.id === archivedId)).toBe(false);
  });

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });
});
