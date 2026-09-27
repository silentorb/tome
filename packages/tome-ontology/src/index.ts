export type {
  Pattern,
  PatternEndpointConstraints,
  PatternMatch,
  PatternMatchContext,
  Predicate,
  RelationshipRuntime,
  TraitMapValue,
} from "./types";

export {
  compileAssociationConfig,
  emptyRelationshipRuntime,
  patternIdFromAssociationType,
} from "./compile";

export {
  ORDERED_PROPERTY_DEFAULT,
  ORDERED_TRAIT,
  SET_TRAIT,
  SYMMETRIC_TRAIT,
  normalizeTraitKey,
} from "./trait-keys";

export {
  hasTraitInEntries,
  mergeTraitMaps,
  traitConfigFromEntries,
  traitEntryKey,
  traitMapFromEntries,
} from "./traits";

export type { SetRoleIndices } from "./query";
export {
  getPredicate,
  patternsMatching,
  traitMapFor,
  hasTrait,
  traitConfig,
  typesWithTrait,
  isSetTraitPredicate,
  isOrderedTraitPredicate,
  isSymmetricPredicate,
  orderedPropertyNameFor,
  setRoleIndicesFor,
  traitsFor,
  linkExistingFor,
} from "./query";

export type { RelationshipTypeRuleEntry } from "./endpoints";
export {
  projectionTypeForEndpoint,
  resolveEndpointTypeIds,
  hostEndpointIndex,
  uniqueHostEndpointIndex,
  projectionTypeForHostTable,
  targetTypeIdForHostTable,
  allowedTargetTypeIdsForEndpoint,
  relationshipTypeRulesFromRuntime,
  endpointConstraintsFor,
  requirePredicate,
} from "./endpoints";
