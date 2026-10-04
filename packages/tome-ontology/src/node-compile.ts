import type { ImpGraph, PerspectivePair } from "tome-graph-interfaces";
import type { Pattern, Predicate, RelationshipRuntime } from "./types";
import { emptyRelationshipRuntime } from "./compile";

/** Stable pattern id for a node-authored predicate. */
export function patternIdFromNodePredicate(predicateId: string): string {
  return `node:${predicateId}`;
}

export interface NodePredicateInput {
  id: string;
  /** Display perspectives; defaults to empty pair when omitted. */
  perspectives?: PerspectivePair;
  /** Optional title used to fill empty perspective slots. */
  title?: string;
  nodeFilter?: ImpGraph;
}

function perspectivesForNode(input: NodePredicateInput): PerspectivePair {
  if (input.perspectives) return input.perspectives;
  const label = input.title?.trim() ?? "";
  return [label, label];
}

/**
 * Compile active ontology predicate nodes into a partial RelationshipRuntime.
 * Each node becomes one predicate + one empty-trait pattern.
 */
export function compileNodePredicates(inputs: readonly NodePredicateInput[]): RelationshipRuntime {
  const predicates = new Map<string, Predicate>();
  const patterns: Pattern[] = [];

  for (const input of inputs) {
    const id = input.id.trim();
    if (!id) continue;
    const predicate: Predicate = {
      id,
      perspectives: perspectivesForNode(input),
    };
    if (input.nodeFilter) {
      predicate.nodeFilter = input.nodeFilter;
    }
    predicates.set(id, predicate);
    patterns.push({
      id: patternIdFromNodePredicate(id),
      match: { predicateId: id },
      traits: [],
    });
  }

  return { predicates, patterns };
}

/**
 * Overlay `overlay` onto `base`. Overlay predicates/patterns win on the same id.
 */
export function mergeRelationshipRuntimes(
  base: RelationshipRuntime,
  overlay: RelationshipRuntime,
): RelationshipRuntime {
  if (overlay.predicates.size === 0 && overlay.patterns.length === 0) {
    return base;
  }
  const predicates = new Map(base.predicates);
  for (const [id, pred] of overlay.predicates) {
    predicates.set(id, pred);
  }
  const overlayPatternIds = new Set(overlay.patterns.map((p) => p.id));
  const overlayPredicateIds = new Set(overlay.predicates.keys());
  const patterns = [
    ...base.patterns.filter(
      (p) => !overlayPatternIds.has(p.id) && !overlayPredicateIds.has(p.match.predicateId),
    ),
    ...overlay.patterns,
  ];
  return { predicates, patterns };
}

export type NodeFilterEvaluator = (
  graph: ImpGraph,
  nodeId: string,
) => boolean | Promise<boolean>;

/**
 * Run a predicate's node-filter against a node id using the provided evaluator.
 * Returns false when the predicate or filter is missing.
 */
export async function predicateSelectsNode(
  runtime: RelationshipRuntime,
  predicateId: string,
  nodeId: string,
  evaluate: NodeFilterEvaluator,
): Promise<boolean> {
  const pred = runtime.predicates.get(predicateId.trim());
  if (!pred?.nodeFilter) return false;
  return evaluate(pred.nodeFilter, nodeId);
}

export function emptyNodePredicateRuntime(): RelationshipRuntime {
  return emptyRelationshipRuntime();
}
