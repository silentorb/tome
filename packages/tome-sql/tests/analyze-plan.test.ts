import { describe, expect, test } from "bun:test";
import {
  analyzeMemberPage,
  planMembershipQuery,
  type ExprCatalog,
} from "../src/index";

function emptyCatalog(overrides?: Partial<ExprCatalog>): ExprCatalog {
  return {
    sorts: new Map(),
    displays: [],
    titleExpr: "title",
    edgeOrderExpr: () => "0",
    ...overrides,
  };
}

describe("tome-sql Analyze / Plan", () => {
  test("Analyze: plain Items request does not invent scope/groups", () => {
    const intent = analyzeMemberPage("set1", {
      projections: [{ setProjection: "a:0", memberProjection: "a:1" }],
      sorts: [{ column: "name", direction: "asc" }],
      relationCounts: [{ column: "links", projectionTypes: ["link:0"] }],
      relationFields: [{ column: "links", projectionTypes: ["link:0"] }],
      intrinsicSequence: true,
      limit: 50,
      offset: 0,
    });
    expect(intent.scope).toBeUndefined();
    expect(intent.groups).toBeUndefined();
    expect(intent.sorts).toHaveLength(1);
    expect(intent.relationFields).toHaveLength(1);
    expect(intent.intrinsicSequence).toBe(true);
  });

  test("Analyze: composition fills scope + groups", () => {
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

  test("Plan: groups add groupPrefix; catalog sorts replace intrinsicSequence", () => {
    const intent = analyzeMemberPage("set1", {
      projections: [{ setProjection: "a:0", memberProjection: "a:1" }],
      groups: {
        memberToGroupProjectionType: "group:0",
        groupTypeDatabaseId: "groupSet",
        groupSetProjections: [{ setProjection: "g:0", memberProjection: "g:1" }],
      },
      sorts: [{ column: "name", direction: "asc" }],
      intrinsicSequence: true,
    });
    const catalog = emptyCatalog({
      sorts: new Map([["name", { sql: "n.title", params: [] }]]),
    });
    const plan = planMembershipQuery(intent, catalog);
    expect(plan.layers).toEqual(["memberUniverse", "groupEnrichment"]);
    expect(plan.orderKeys.map((k) => k.kind)).toEqual([
      "groupPrefix",
      "catalogSort",
      "title",
      "id",
    ]);
  });
});
