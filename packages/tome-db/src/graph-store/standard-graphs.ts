import type { Graph } from "imp-core-types";
import { mergeDesugarIntoGraph } from "imp-pathing";
import {
  bindTomeSemanticPath,
  type BindTomeSemanticPathOptions,
} from "tome-imp-sql";
import type { ImpGraph } from "tome-graph-interfaces";

function edge(
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string,
): ImpGraph["edges"][string] {
  return { from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort } };
}

function literalNode(id: string, value: string | number | boolean | null): ImpGraph["nodes"][string] {
  return { id, type: "literal", inputs: { value } };
}

/** All live nodes sorted by modified_at descending, limited. */
export function recentNodesGraph(limit: number): ImpGraph {
  const sort = "sort";
  const output = "output";
  return {
    nodes: {
      input: { id: "input", type: "input", inputs: {} },
      [sort]: {
        id: sort,
        type: "sort",
        inputs: { column: "modified_at", direction: "desc" },
      },
      limit: {
        id: "limit",
        type: "limit",
        inputs: { count: limit },
      },
      project: {
        id: "project",
        type: "project",
        inputs: { columns: "id,title,modified_at" },
      },
      [output]: { id: output, type: "output", inputs: {} },
    },
    edges: {
      e1: edge("input", "value", sort, "collection"),
      e2: edge(sort, "collection", "limit", "collection"),
      e3: edge("limit", "collection", "project", "collection"),
      e4: edge("project", "collection", output, "value"),
    },
  };
}

/**
 * Type-table members via one hop on the set-side association.
 * Imp graphs use bare association + direction (not packed projection types).
 */
export function typeMembersGraph(
  setNodeId: string,
  associationId: string,
  direction: 0 | 1,
): ImpGraph {
  const setIdLit = "set_id_lit";
  const assocLit = "assoc_lit";
  const dirLit = "dir_lit";
  const equalsLeft = "equals_left";
  const equalsRight = "equals_right";
  const filter = "filter";
  const equals = "equals";
  const hop = "hop";
  const output = "output";
  return {
    nodes: {
      input: { id: "input", type: "input", inputs: {} },
      [setIdLit]: literalNode(setIdLit, setNodeId),
      [assocLit]: literalNode(assocLit, associationId),
      [dirLit]: literalNode(dirLit, direction),
      [equalsLeft]: { id: equalsLeft, type: "column", inputs: { name: "id" } },
      [equalsRight]: literalNode(equalsRight, setNodeId),
      [equals]: { id: equals, type: "equals", inputs: {} },
      [filter]: { id: filter, type: "filter", inputs: {} },
      [hop]: {
        id: hop,
        type: "traverse",
        inputs: { edge_property: null, edge_equals: null },
      },
      [output]: { id: output, type: "output", inputs: {} },
    },
    edges: {
      e1: edge("input", "value", filter, "collection"),
      e2: edge(filter, "collection", hop, "collection"),
      e3: edge(hop, "collection", output, "value"),
      e4: edge(equalsLeft, "value", equals, "left"),
      e5: edge(equalsRight, "value", equals, "right"),
      e6: edge(equals, "value", filter, "predicate"),
      e7: edge(assocLit, "value", hop, "association"),
      e8: edge(dirLit, "value", hop, "direction"),
    },
  };
}

/** Title search via declarative `search` transform — host adapter applies heuristics. */
export function searchNodesGraph(limit: number): ImpGraph {
  const queryParam = "query_param";
  const search = "search";
  const limitId = "limit";
  const project = "project";
  const output = "output";
  return {
    nodes: {
      input: { id: "input", type: "input", inputs: {} },
      [queryParam]: {
        id: queryParam,
        type: "parameter",
        inputs: { label: "query", value: "" },
      },
      [search]: { id: search, type: "search", inputs: {} },
      [limitId]: {
        id: limitId,
        type: "limit",
        inputs: { count: limit },
      },
      project: {
        id: project,
        type: "project",
        inputs: { columns: "id,title" },
      },
      [output]: { id: output, type: "output", inputs: {} },
    },
    edges: {
      e1: edge("input", "value", search, "collection"),
      e2: edge(queryParam, "value", search, "query"),
      e3: edge(search, "collection", limitId, "collection"),
      e4: edge(limitId, "collection", project, "collection"),
      e5: edge(project, "collection", output, "value"),
    },
  };
}

/** Outgoing relationships from a source node (one hop, direction 0). */
export function outgoingRelationshipsGraph(
  sourceNodeId: string,
  associationId: string,
): ImpGraph {
  return relationshipHopGraph(sourceNodeId, associationId, 0);
}

/** Incoming relationships to a target node (one hop, direction 1). */
export function incomingRelationshipsGraph(
  targetNodeId: string,
  associationId: string,
): ImpGraph {
  return relationshipHopGraph(targetNodeId, associationId, 1);
}

function relationshipHopGraph(
  anchorNodeId: string,
  associationId: string,
  direction: 0 | 1,
): ImpGraph {
  const anchorLit = "anchor_lit";
  const assocLit = "assoc_lit";
  const dirLit = "dir_lit";
  const equalsLeft = "equals_left";
  const equalsRight = "equals_right";
  const filter = "filter";
  const equals = "equals";
  const hop = "hop";
  const output = "output";
  return {
    nodes: {
      input: { id: "input", type: "input", inputs: {} },
      [anchorLit]: literalNode(anchorLit, anchorNodeId),
      [assocLit]: literalNode(assocLit, associationId),
      [dirLit]: literalNode(dirLit, direction),
      [equalsLeft]: { id: equalsLeft, type: "column", inputs: { name: "id" } },
      [equalsRight]: literalNode(equalsRight, anchorNodeId),
      [equals]: { id: equals, type: "equals", inputs: {} },
      [filter]: { id: filter, type: "filter", inputs: {} },
      [hop]: {
        id: hop,
        type: "traverse",
        inputs: { edge_property: null, edge_equals: null },
      },
      [output]: { id: output, type: "output", inputs: {} },
    },
    edges: {
      e1: edge("input", "value", filter, "collection"),
      e2: edge(filter, "collection", hop, "collection"),
      e3: edge(hop, "collection", output, "value"),
      e4: edge(equalsLeft, "value", equals, "left"),
      e5: edge(equalsRight, "value", equals, "right"),
      e6: edge(equals, "value", filter, "predicate"),
      e7: edge(assocLit, "value", hop, "association"),
      e8: edge(dirLit, "value", hop, "direction"),
    },
  };
}

export type SemanticPathFromAnchorOptions = {
  ontology: BindTomeSemanticPathOptions["ontology"];
  startType: string;
  asScalar?: boolean;
  prefix?: string;
};

/**
 * Filter to an anchor node, then navigate/project via semantic path tokens.
 * Prefer this over hand-wiring traverse + project chains when a type context is known.
 */
export function semanticPathFromAnchorGraph(
  anchorNodeId: string,
  tokens: readonly string[],
  options: SemanticPathFromAnchorOptions,
): ImpGraph {
  const prefix = options.prefix ?? "sem";
  const equalsLeft = "equals_left";
  const equalsRight = "equals_right";
  const filter = "filter";
  const equals = "equals";
  const output = "output";

  const base: ImpGraph = {
    nodes: {
      input: { id: "input", type: "input", inputs: {} },
      [equalsLeft]: { id: equalsLeft, type: "column", inputs: { name: "id" } },
      [equalsRight]: literalNode(equalsRight, anchorNodeId),
      [equals]: { id: equals, type: "equals", inputs: {} },
      [filter]: { id: filter, type: "filter", inputs: {} },
      [output]: { id: output, type: "output", inputs: {} },
    },
    edges: {
      e1: edge("input", "value", filter, "collection"),
      e4: edge(equalsLeft, "value", equals, "left"),
      e5: edge(equalsRight, "value", equals, "right"),
      e6: edge(equals, "value", filter, "predicate"),
    },
  };

  const bound = bindTomeSemanticPath(tokens, {
    ontology: options.ontology,
    startType: options.startType,
    prefix,
    source: { node: filter, port: "collection" },
    asScalar: options.asScalar,
  });

  const merged = mergeDesugarIntoGraph(base, bound) as ImpGraph;
  merged.edges[`${prefix}_to_output`] = {
    from: bound.collection,
    to: { node: output, port: "value" },
  };
  return merged;
}

export const standardImpGraphs = {
  recent: recentNodesGraph,
  typeMembers: typeMembersGraph,
  search: searchNodesGraph,
  outgoingRelationships: outgoingRelationshipsGraph,
  incomingRelationships: incomingRelationshipsGraph,
  semanticPathFromAnchor: semanticPathFromAnchorGraph,
} as const;

export type StandardImpGraphName = keyof typeof standardImpGraphs;

/** @deprecated use standardImpGraphs */
export const standardGraphs = standardImpGraphs;

export function buildStandardGraph(name: StandardImpGraphName, ...args: never[]): Graph {
  const factory = standardImpGraphs[name] as (...a: never[]) => ImpGraph;
  return factory(...args) as Graph;
}
