import { describe, expect, test } from "bun:test";
import {
  analyzeMemberPage,
  bindExpressions,
  compileMemberPage,
  MEMBER_ID_TOKEN,
  planMembershipQuery,
} from "../src/membership-query";

describe("membership-query Analyze→Bind→Plan→Emit", () => {
  test("Analyze: plain Items request does not invent scope/groups", () => {
    const intent = analyzeMemberPage("set1", {
      projections: [{ setProjection: "a:0", memberProjection: "a:1" }],
      sorts: [{ column: "name", direction: "asc" }],
      relationCounts: [{ column: "links", projectionTypes: ["link:0"] }],
      relationFields: [{ column: "links", projectionTypes: ["link:0"] }],
      defaultOrdered: true,
      limit: 50,
      offset: 0,
    });
    expect(intent.scope).toBeUndefined();
    expect(intent.groups).toBeUndefined();
    expect(intent.sorts).toHaveLength(1);
    expect(intent.relationFields).toHaveLength(1);
    expect(intent.defaultOrdered).toBe(true);
  });

  test("Analyze: composition fills scope + groups need classes", () => {
    const intent = analyzeMemberPage("set1", {
      projections: [{ setProjection: "a:0", memberProjection: "a:1" }],
      scope: { projectionType: "scope:0", scopeNodeId: "book1" },
      groups: {
        memberToGroupProjectionType: "group:0",
        groupTypeDatabaseId: "groupSet",
        groupSetProjections: [{ setProjection: "g:0", memberProjection: "g:1" }],
        canonicalGroupByTitle: false,
      },
      relationFields: [{ column: "links", projectionTypes: ["link:0"] }],
    });
    expect(intent.scope?.scopeNodeId).toBe("book1");
    expect(intent.groups?.canonicalGroupByTitle).toBe(false);
    expect(intent.relationFields[0]?.column).toBe("links");
  });

  test("Bind: sort and relation display share catalog; Session 1 composite CASE shape", () => {
    const intent = analyzeMemberPage("set1", {
      projections: [{ setProjection: "a:0", memberProjection: "a:1" }],
      sorts: [{ column: "links", direction: "desc" }],
      relationCounts: [{ column: "links", projectionTypes: ["link:0", "link:1"] }],
      relationFields: [
        {
          column: "links",
          projectionTypes: ["link:0"],
          compositeType: "composite.links",
        },
      ],
    });
    const catalog = bindExpressions(intent);
    expect(catalog.sorts.has("links")).toBe(true);
    expect(catalog.sorts.get("links")!.sql).toContain(MEMBER_ID_TOKEN);
    expect(catalog.displays).toHaveLength(1);
    expect(catalog.displays[0]!.alias).toBe("rf_0");
    expect(catalog.displays[0]!.sql).toContain("CASE WHEN");
    expect(catalog.displays[0]!.sql).toContain(MEMBER_ID_TOKEN);
  });

  test("Plan: groups add groupPrefix; catalog sorts replace defaultOrdered", () => {
    const intent = analyzeMemberPage("set1", {
      projections: [{ setProjection: "a:0", memberProjection: "a:1" }],
      groups: {
        memberToGroupProjectionType: "group:0",
        groupTypeDatabaseId: "groupSet",
        groupSetProjections: [{ setProjection: "g:0", memberProjection: "g:1" }],
      },
      sorts: [{ column: "name", direction: "asc" }],
      defaultOrdered: true,
    });
    const catalog = bindExpressions(intent);
    const plan = planMembershipQuery(intent, catalog);
    expect(plan.layers).toEqual(["memberUniverse", "groupEnrichment"]);
    expect(plan.orderKeys.map((k) => k.kind)).toEqual([
      "groupPrefix",
      "catalogSort",
      "title",
      "id",
    ]);
  });

  test("Emit: plain page and enriched page are one statement family", () => {
    const plain = compileMemberPage("set1", {
      projections: [{ setProjection: "a:0", memberProjection: "a:1" }],
      defaultOrdered: true,
      relationFields: [{ column: "links", projectionTypes: ["link:0"] }],
      limit: 10,
      offset: 0,
    });
    expect(plain.empty).toBe(false);
    expect(plain.pageSql).toContain("WITH membership AS");
    expect(plain.pageSql).toContain("FROM members m");
    expect(plain.pageSql).toContain("AS rf_0");
    expect(plain.relationColumns).toEqual(["links"]);
    expect(plain.applyLimitOffset).toBe(true);

    const composed = compileMemberPage("set1", {
      projections: [{ setProjection: "a:0", memberProjection: "a:1" }],
      scope: { projectionType: "scope:0", scopeNodeId: "book1" },
      groups: {
        memberToGroupProjectionType: "group:0",
        groupTypeDatabaseId: "groupSet",
        groupSetProjections: [{ setProjection: "g:0", memberProjection: "g:1" }],
      },
      defaultOrdered: true,
      relationFields: [{ column: "links", projectionTypes: ["link:0"] }],
    });
    expect(composed.empty).toBe(false);
    expect(composed.pageSql).toContain("scoped_members");
    expect(composed.pageSql).toContain("member_with_group");
    expect(composed.pageSql).toContain("resolved_group_id");
    expect(composed.includeGroupId).toBe(true);
    expect(composed.relationColumns).toEqual(["links"]);
  });
});
