import { afterAll, describe, expect, test } from "bun:test";
import {
  createTestContentFixture,
  destroyTestContentFixture,
  seedTestNode,
  seedTestRelationships,
} from "tome-db/content/test-helpers";
import { createLikeSearch } from "../src/like-search";
import { register } from "../src/search";
import type {
  SearcherHost,
  SearcherRegistration,
  TomeSearch,
  TomeSearchHit,
  TomeSearchRequest,
} from "tome-interfaces/search";

async function runSearch(
  search: TomeSearch,
  request: TomeSearchRequest,
): Promise<TomeSearchHit[]> {
  return await search.search(request);
}

describe("tome-search-like", () => {
  const fixture = createTestContentFixture("tome-search-like-");
  const search = createLikeSearch(fixture.ctx.cache);

  afterAll(() => {
    destroyTestContentFixture(fixture);
  });

  test("title matches appear before body-only matches", async () => {
    const titleId = "000000000000000000000000C1";
    const bodyId = "000000000000000000000000C2";
    seedTestNode(fixture, {
      id: titleId,
      properties: { title: "Zebra Like Title", body: "no marker" },
    });
    seedTestNode(fixture, {
      id: bodyId,
      properties: { title: "Alpha Unrelated", body: "contains like-body-marker here" },
    });

    const hits = await runSearch(search, { query: "like", limit: 10 });
    const ids = hits.map((h) => h.id);
    expect(ids.indexOf(titleId)).toBeLessThan(ids.indexOf(bodyId));
  });

  test("orders title hits by SQL COLLATE NOCASE, not relevance ranking", async () => {
    const exactId = "000000000000000000000000C3";
    const longerId = "000000000000000000000000C4";
    // Exact title "Surreal" would rank first under TS relevance; SQL COLLATE orders
    // "Applied Surrealism" before "Surreal".
    seedTestNode(fixture, {
      id: exactId,
      properties: { title: "Surreal" },
    });
    seedTestNode(fixture, {
      id: longerId,
      properties: { title: "Applied Surrealism" },
    });

    const hits = await runSearch(search, { query: "Surreal", limit: 10 });
    const ids = hits.map((h) => h.id).filter((id) => id === exactId || id === longerId);
    expect(ids).toEqual([longerId, exactId]);
  });

  test("attaches matchPreview for body-only matches", async () => {
    const bodyId = "000000000000000000000000C5";
    seedTestNode(fixture, {
      id: bodyId,
      properties: {
        title: "Preview Host",
        body: "prefix unique-like-preview-marker suffix",
      },
    });
    const hits = await runSearch(search, { query: "unique-like-preview-marker", limit: 10 });
    const hit = hits.find((h) => h.id === bodyId);
    expect(hit?.matchPreview?.parts.some((p) => p.highlight)).toBe(true);
  });

  test("allowedNodeIds filters in SQL", async () => {
    const keepId = "000000000000000000000000C6";
    const dropId = "000000000000000000000000C7";
    seedTestNode(fixture, {
      id: keepId,
      properties: { title: "Filter Keep Node" },
    });
    seedTestNode(fixture, {
      id: dropId,
      properties: { title: "Filter Drop Node" },
    });

    const hits = await runSearch(search, {
      query: "Filter",
      limit: 10,
      allowedNodeIds: new Set([keepId]),
    });
    expect(hits.map((h) => h.id)).toEqual([keepId]);
  });

  test("allowedTypeIds filters via SQL EXISTS", async () => {
    const featuresDbId = "000000000000000000000000C8";
    const alphaId = "000000000000000000000000C9";
    const outsiderId = "000000000000000000000000CA";

    seedTestNode(fixture, { id: featuresDbId, properties: { title: "Like Features" } });
    seedTestNode(fixture, { id: alphaId, properties: { title: "Like Alpha Feature" } });
    seedTestNode(fixture, { id: outsiderId, properties: { title: "Like AAA Other" } });
    seedTestRelationships(fixture, [
      { source: alphaId, target: featuresDbId, type: "member_of" },
    ]);

    const hits = await runSearch(search, {
      query: "Like",
      limit: 10,
      allowedTypeIds: [featuresDbId],
    });
    const ids = hits.map((h) => h.id);
    expect(ids).toContain(alphaId);
    expect(ids).not.toContain(outsiderId);
  });

  test("register requires getQueryCache on host", async () => {
    const registrations: SearcherRegistration[] = [];
    const host: SearcherHost = {
      registerSearcher(registration) {
        registrations.push(registration);
      },
    };
    register(host);
    expect(registrations).toHaveLength(1);
    expect(registrations[0]!.implementationId).toBe("tome-search-like");

    expect(() =>
      registrations[0]!.open({
        params: {},
        host: {},
      }),
    ).toThrow(/getQueryCache/);

    const opened = await registrations[0]!.open({
      params: {},
      host: { getQueryCache: () => fixture.ctx.cache },
    });
    const hits = await opened.search({ query: "Filter Keep", limit: 5 });
    expect(hits.some((h) => h.id === "000000000000000000000000C6")).toBe(true);
  });
});
