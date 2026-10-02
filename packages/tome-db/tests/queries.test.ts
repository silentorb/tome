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

describe("queries", async () => {
  const fixture = await createTestContentFixture("tome-db-queries-");

  test("getNodeDetail returns title and body", async () => {
    await seedTestNode(fixture, {
      id: "00000000000000000000000001",
      properties: {
        title: "Alpha",
        body: "# Hello",
      },
    });
    const detail = await getNodeDetail(fixture.ctx.cache, "00000000000000000000000001");
    expect(detail?.id).toBe("00000000000000000000000001");
    expect(detail?.title).toBe("Alpha");
    expect(detail?.body.trimEnd()).toBe("# Hello");
    expect(detail?.primaryTypeTitle).toBeNull();
  });

  test("searchNodes matches title prefix", async () => {
    await seedTestNode(fixture, {
      id: "00000000000000000000000004",
      properties: { title: "Beta Record" },
    });
    const hits = await searchNodes(fixture.ctx.cache, "Beta", 10);
    expect(hits.some((h) => h.id === "00000000000000000000000004")).toBe(true);
  });

  test("searchNodes orders title matches by title ascending (SQL only)", async () => {
    const exactId = "0000000000000000000000001T";
    const longerId = "00000000000000000000000024";
    await seedTestNode(fixture, {
      id: exactId,
      properties: { title: "Surreal" },
    });
    await seedTestNode(fixture, {
      id: longerId,
      properties: { title: "Applied Surrealism" },
    });

    const hits = await searchNodes(fixture.ctx.cache, "Surreal", 10);
    // LIKE path uses ORDER BY title COLLATE NOCASE — no TS relevance ranking.
    expect(hits.map((row) => row.id)).toEqual([longerId, exactId]);
  });

  test("performTomeTextSearch lists title matches before body-only matches", async () => {
    const titleMatchId = "0000000000000000000000002F";
    const bodyOnlyId = "0000000000000000000000002R";
    await seedTestNode(fixture, {
      id: titleMatchId,
      properties: {
        title: "Surreal Title Match",
        body: "no marker here",
      },
    });
    await seedTestNode(fixture, {
      id: bodyOnlyId,
      properties: {
        title: "Unrelated",
        body: "contains surreal-body-marker text",
      },
    });

    const hits = await searchNodes(fixture.ctx.cache, "surreal", 10);
    expect(hits.map((row) => row.id).indexOf(titleMatchId)).toBeLessThan(
      hits.map((row) => row.id).indexOf(bodyOnlyId),
    );
  });

  test("performTomeTextSearch matches body text", async () => {
    const bodyOnlyId = "0000000000000000000000000N";
    await seedTestNode(fixture, {
      id: bodyOnlyId,
      properties: {
        title: "Unrelated Title",
        body: "unique-body-marker-xyz",
      },
    });
    const titleOnly = await searchNodes(fixture.ctx.cache, "unique-body-marker", 10);
    expect(titleOnly.some((h) => h.id === bodyOnlyId)).toBe(true);
  });

  test("performTomeTextSearch attaches matchPreview for body-only matches", async () => {
    const bodyOnlyId = "0000000000000000000000000Q";
    await seedTestNode(fixture, {
      id: bodyOnlyId,
      properties: {
        title: "Another Unrelated Title",
        body: "prefix unique-preview-marker suffix",
      },
    });
    const hits = await searchNodes(fixture.ctx.cache, "unique-preview-marker", 10);
    const hit = hits.find((h) => h.id === bodyOnlyId);
    expect(hit).toBeDefined();
    expect(hit?.matchPreview).toBeDefined();
    expect(
      hit?.matchPreview?.parts.some((p) => p.highlight && p.text.includes("unique-preview-marker")),
    ).toBe(true);
  });

  test("searchNodes omits matchPreview for title-only matches", async () => {
    const titleOnlyId = "0000000000000000000000000W";
    await seedTestNode(fixture, {
      id: titleOnlyId,
      properties: {
        title: "title-only-marker-node",
        body: "body without the search term",
      },
    });
    const hits = await searchNodes(fixture.ctx.cache, "title-only-marker", 10);
    const hit = hits.find((h) => h.id === titleOnlyId);
    expect(hit).toBeDefined();
    expect(hit?.matchPreview).toBeUndefined();
  });

  test("searchNodes with allowedTypeIds returns title-ordered eligible nodes up to limit", async () => {
    const featuresDbId = "11111111111111111111111111";
    const alphaId = "22222222222222222222222222";
    const betaId = "33333333333333333333333333";
    const zetaId = "44444444444444444444444444";
    const outsiderId = "55555555555555555555555555";

    await seedTestNode(fixture, { id: featuresDbId, properties: { title: "Features" } });
    await seedTestNode(fixture, { id: alphaId, properties: { title: "Alpha Feature" } });
    await seedTestNode(fixture, { id: betaId, properties: { title: "Beta Feature" } });
    await seedTestNode(fixture, { id: zetaId, properties: { title: "Zeta Feature" } });
    await seedTestNode(fixture, { id: outsiderId, properties: { title: "AAA Other" } });
    await seedTestRelationships(fixture, [
      { source: alphaId, target: featuresDbId, type: "member_of" },
      { source: betaId, target: featuresDbId, type: "member_of" },
      { source: zetaId, target: featuresDbId, type: "member_of" },
    ]);

    const hits = await searchNodes(fixture.ctx.cache, "", 2, [featuresDbId]);
    expect(hits.map((row) => row.title)).toEqual(["Alpha Feature", "Beta Feature"]);
  });

  test("updateNodeBody persists markdown", async () => {
    await seedTestNode(fixture, {
      id: "0000000000000000000000000E",
      properties: { title: "Gamma", body: "old" },
    });
    expect(await updateNodeBody(fixture.ctx, "0000000000000000000000000E", "new body")).toBe(true);
    expect((await getNodeDetail(fixture.ctx.cache, "0000000000000000000000000E"))?.body.trimEnd()).toBe(
      "new body",
    );
  });

  test("updateNodeTitle rejects empty and Untitled", async () => {
    await seedTestNode(fixture, {
      id: "0000000000000000000000000F",
      properties: { title: "Keep me", body: "body" },
    });
    expect(await updateNodeTitle(fixture.ctx, "0000000000000000000000000F", "")).toBe(false);
    expect(await updateNodeTitle(fixture.ctx, "0000000000000000000000000F", "Untitled")).toBe(false);
    expect((await getNodeDetail(fixture.ctx.cache, "0000000000000000000000000F"))?.title).toBe("Keep me");
    expect(await updateNodeTitle(fixture.ctx, "0000000000000000000000000F", "Renamed")).toBe(true);
    expect((await getNodeDetail(fixture.ctx.cache, "0000000000000000000000000F"))?.title).toBe("Renamed");
  });

  test("listRecentNodesByModifiedAt orders by modified_at descending", async () => {
    const olderId = "00000000000000000000000011";
    const newerId = "00000000000000000000000016";
    await seedTestNode(fixture, {
      id: olderId,
      properties: {
        title: "Older",
        modified_at: "2024-01-01T00:00:00.000Z",
      },
    });
    await seedTestNode(fixture, {
      id: newerId,
      properties: {
        title: "Newer",
        modified_at: "2024-06-01T00:00:00.000Z",
      },
    });

    const recent = await listRecentNodesByModifiedAt(fixture.ctx.cache, 10);
    const olderIndex = recent.findIndex((row) => row.id === olderId);
    const newerIndex = recent.findIndex((row) => row.id === newerId);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  test("listRecentNodesByModifiedAt omits nodes without modified_at", async () => {
    const withTimestamp = "0000000000000000000000001A";
    const withoutTimestamp = "0000000000000000000000001B";
    await seedTestNode(fixture, {
      id: withTimestamp,
      properties: {
        title: "Has Timestamp",
        modified_at: "2024-03-01T00:00:00.000Z",
      },
    });
    await seedTestNode(fixture, {
      id: withoutTimestamp,
      properties: { title: "No Timestamp" },
    });

    const recent = await listRecentNodesByModifiedAt(fixture.ctx.cache, 100);
    expect(recent.some((row) => row.id === withTimestamp)).toBe(true);
    expect(recent.some((row) => row.id === withoutTimestamp)).toBe(false);
  });

  test("listRecentNodesByModifiedAt ignores relationship property updates", async () => {
    const pageId = "0000000000000000000000001V";
    const targetId = "00000000000000000000000027";
    await seedTestNode(fixture, {
      id: pageId,
      properties: {
        title: "Page",
        modified_at: "2024-01-01T00:00:00.000Z",
      },
    });
    await seedTestNode(fixture, {
      id: targetId,
      properties: {
        title: "Target",
        modified_at: "2024-06-01T00:00:00.000Z",
      },
    });
    await seedTestCompositeRelationships(fixture, [
      {
        a: pageId,
        b: targetId,
        typeFromA: "Related",
        typeFromB: "Related",
        relationshipTypeId: TEST_RELATED_ASSOCIATION_ID,
        properties: { priority: "Low" },
      },
    ]);

    const before = await listRecentNodesByModifiedAt(fixture.ctx.cache, 10);
    const pageIndexBefore = before.findIndex((row) => row.id === pageId);
    const targetIndexBefore = before.findIndex((row) => row.id === targetId);
    expect(pageIndexBefore).toBeGreaterThan(targetIndexBefore);

    expect(
      await updateOutgoingRelationshipProperty(
        fixture.ctx,
        pageId,
        targetId,
        projectionTypeForEndpoint(TEST_RELATED_ASSOCIATION_ID, 0),
        "priority",
        "High",
      ),
    ).toBeNull();

    const after = await listRecentNodesByModifiedAt(fixture.ctx.cache, 10);
    expect(after.findIndex((row) => row.id === pageId)).toBe(pageIndexBefore);
    expect(after.findIndex((row) => row.id === targetId)).toBe(targetIndexBefore);
  });

  test("listRecentNodesByModifiedAt excludes archived nodes", async () => {
    const activeId = "0000000000000000000000002H";
    const archivedId = "0000000000000000000000002S";
    await seedTestNode(fixture, {
      id: TEST_ARCHIVE_NODE_ID,
      properties: { title: "Archive" },
    });
    await seedTestNode(fixture, {
      id: activeId,
      properties: {
        title: "Active",
        modified_at: "2024-02-01T00:00:00.000Z",
      },
    });
    await seedTestNode(fixture, {
      id: archivedId,
      properties: {
        title: "Archived",
        modified_at: "2024-08-01T00:00:00.000Z",
      },
    });
    await seedTestRelationships(fixture, [
      { source: archivedId, target: TEST_ARCHIVE_NODE_ID, type: "member_of" },
    ]);

    const recent = await listRecentNodesByModifiedAt(fixture.ctx.cache, 100);
    expect(recent.some((row) => row.id === activeId)).toBe(true);
    expect(recent.some((row) => row.id === archivedId)).toBe(false);
  });

  afterAll(async () => {
    await destroyTestContentFixture(fixture);
  });
});
