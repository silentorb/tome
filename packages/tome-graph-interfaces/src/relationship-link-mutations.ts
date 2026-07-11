import type { Properties } from "./graph";

export type LinkOutgoingRelationshipError =
  | "source_not_found"
  | "target_not_found"
  | "duplicate"
  | "target_type_not_allowed"
  | "unresolvable_type";

export type UnlinkOutgoingRelationshipError = "not_found";

export type MoveRelationshipConnectionError =
  | "not_found"
  | LinkOutgoingRelationshipError;

export interface LinkOutgoingRelationshipInput {
  sourceId: string;
  targetId: string;
  type: string;
  properties?: Properties;
}

export interface MoveRelationshipConnectionInput {
  type: string;
  oldSourceId: string;
  oldTargetId: string;
  newSourceId: string;
  newTargetId: string;
}
