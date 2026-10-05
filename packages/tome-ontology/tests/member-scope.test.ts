import { describe, expect, test } from "bun:test";
import {
  HOSTS_PROJECTION_NODE_TYPE,
  hostsProjectionFilterGraph,
  hostsProjectionType,
  memberPredicateForTypeTable,
  parseHostsProjectionFilter,
  parseLiteralBooleanFilter,
  type MemberScope,
} from "../src/index";

describe("member-scope helpers", () => {
  test("memberPredicateForTypeTable returns first stable scope", () => {
    const scopes: MemberScope[] = [
      { id: "b", typeTableId: "HUB", predicateId: "P2" },
      { id: "a", typeTableId: "HUB", predicateId: "P1" },
      { id: "c", typeTableId: "OTHER", predicateId: "P3" },
    ];
    expect(memberPredicateForTypeTable(scopes, "HUB")).toBe("P1");
    expect(memberPredicateForTypeTable(scopes, "missing")).toBeUndefined();
  });
});

describe("node-filter shapes", () => {
  test("parseHostsProjectionFilter reads wired literals", () => {
    const graph = hostsProjectionFilterGraph("01KXBNPNJDENZ9BXN5BYZ7JKPR", 0);
    const spec = parseHostsProjectionFilter(graph);
    expect(spec).toEqual({
      relationshipTypeId: "01KXBNPNJDENZ9BXN5BYZ7JKPR",
      direction: 0,
    });
    expect(hostsProjectionType(spec!)).toBe("01KXBNPNJDENZ9BXN5BYZ7JKPR:0");
    expect(graph.nodes.hosts?.type).toBe(HOSTS_PROJECTION_NODE_TYPE);
  });

  test("parseLiteralBooleanFilter", () => {
    expect(
      parseLiteralBooleanFilter({
        nodes: { lit: { id: "lit", type: "literal", inputs: { value: true } } },
        edges: {},
      }),
    ).toBe(true);
    expect(
      parseLiteralBooleanFilter({
        nodes: { lit: { id: "lit", type: "literal", inputs: { value: false } } },
        edges: {},
      }),
    ).toBe(false);
    expect(parseLiteralBooleanFilter(hostsProjectionFilterGraph("X", 0))).toBeNull();
  });
});
