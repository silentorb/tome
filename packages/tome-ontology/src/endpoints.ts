import type { PatternMatchContext, RelationshipRuntime } from "./types";
import { getPredicate, patternsMatching } from "./query";

/** Directed projection identity: predicate id + endpoint index. */
export function projectionTypeForEndpoint(
  predicateId: string,
  endpointIndex: 0 | 1,
): string {
  return `${predicateId.trim()}:${endpointIndex}`;
}

export function resolveEndpointTypeIds(
  runtime: RelationshipRuntime,
  predicateId: string,
): [string, string] | null {
  for (const pattern of patternsMatching(runtime, { predicateId })) {
    if (pattern.endpoints) {
      return [pattern.endpoints[0].typeId, pattern.endpoints[1].typeId];
    }
  }
  return null;
}

export function hostEndpointIndex(
  runtime: RelationshipRuntime,
  predicateId: string,
  hostTypeId: string,
): 0 | 1 | null {
  const endpoints = resolveEndpointTypeIds(runtime, predicateId);
  if (!endpoints) return null;
  if (endpoints[0] === hostTypeId) return 0;
  if (endpoints[1] === hostTypeId) return 1;
  return null;
}

/** Endpoint index when host uniquely matches one side (null if both/neither). */
export function uniqueHostEndpointIndex(
  runtime: RelationshipRuntime,
  predicateId: string,
  hostTypeId: string,
): 0 | 1 | null {
  const endpoints = resolveEndpointTypeIds(runtime, predicateId);
  if (!endpoints) return null;
  const matches: Array<0 | 1> = [];
  if (endpoints[0] === hostTypeId) matches.push(0);
  if (endpoints[1] === hostTypeId) matches.push(1);
  return matches.length === 1 ? matches[0]! : null;
}

export function projectionTypeForHostTable(
  runtime: RelationshipRuntime,
  predicateId: string,
  hostTypeId: string,
): string | null {
  const index = hostEndpointIndex(runtime, predicateId, hostTypeId);
  if (index === null) return null;
  return projectionTypeForEndpoint(predicateId, index);
}

export function targetTypeIdForHostTable(
  runtime: RelationshipRuntime,
  predicateId: string,
  hostTypeId: string,
): string | null {
  const index = hostEndpointIndex(runtime, predicateId, hostTypeId);
  const endpoints = resolveEndpointTypeIds(runtime, predicateId);
  if (index === null || !endpoints) return null;
  const other: 0 | 1 = index === 0 ? 1 : 0;
  return endpoints[other];
}

export function allowedTargetTypeIdsForEndpoint(
  runtime: RelationshipRuntime,
  predicateId: string,
  endpointIndex: 0 | 1,
): string[] {
  const endpoints = resolveEndpointTypeIds(runtime, predicateId);
  if (!endpoints) return [];
  const other: 0 | 1 = endpointIndex === 0 ? 1 : 0;
  return [endpoints[other]];
}

export interface RelationshipTypeRuleEntry {
  id: string;
  sourceTypeId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

/** All relationship rules implied by pattern endpoint definitions. */
export function relationshipTypeRulesFromRuntime(
  runtime: RelationshipRuntime,
): RelationshipTypeRuleEntry[] {
  const rules: RelationshipTypeRuleEntry[] = [];
  for (const predicateId of runtime.predicates.keys()) {
    const endpoints = resolveEndpointTypeIds(runtime, predicateId);
    if (!endpoints) continue;
    for (const hostIndex of [0, 1] as const) {
      rules.push({
        id: predicateId,
        sourceTypeId: endpoints[hostIndex],
        type: projectionTypeForEndpoint(predicateId, hostIndex),
        allowedTargetTypeIds: allowedTargetTypeIdsForEndpoint(
          runtime,
          predicateId,
          hostIndex,
        ),
      });
    }
  }
  return rules;
}

export function endpointConstraintsFor(
  runtime: RelationshipRuntime,
  ctx: PatternMatchContext,
): { 0: { typeId: string }; 1: { typeId: string } } | undefined {
  for (const pattern of patternsMatching(runtime, ctx)) {
    if (pattern.endpoints) return pattern.endpoints;
  }
  return undefined;
}

/** Ensure predicate exists (for adapters that previously threw on unknown types). */
export function requirePredicate(
  runtime: RelationshipRuntime,
  predicateId: string,
): void {
  if (!getPredicate(runtime, predicateId)) {
    throw new Error(`Unknown relationship predicate "${predicateId}"`);
  }
}
