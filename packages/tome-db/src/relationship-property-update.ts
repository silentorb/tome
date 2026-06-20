import type { Properties } from "./graph";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import {
  coalescePriorityValue,
  getPriorityDefault,
  isPriorityColumnKey,
  isPriorityValue,
  isUnsetPriority,
} from "./property-enums";
import { TYPE_MEMBERSHIP_TYPES } from "./labels";

export type RelationshipPropertyUpdateError = "not_found" | "invalid_value";

export function updateOutgoingRelationshipProperty(
  ctx: TomeWriteContext,
  sourceNodeId: string,
  targetNodeId: string,
  type: string,
  propertyKey: string,
  value: string | null,
): RelationshipPropertyUpdateError | null {
  const connection = ctx.store.findRelationship(sourceNodeId, targetNodeId, type);
  if (!connection) return "not_found";

  if (isPriorityColumnKey(propertyKey)) {
    const defaultPriority = getPriorityDefault();
    const resolved: string = isUnsetPriority(value) ? defaultPriority : (value ?? defaultPriority);
    if (!isPriorityValue(resolved)) return "invalid_value";
    ctx.store.mergeRelationshipProperties(sourceNodeId, targetNodeId, type, {
      ...connection.properties,
      [propertyKey]: resolved,
    });
    syncAfterRelationshipsWrite(ctx);
    return null;
  }

  const patch: Properties = { ...connection.properties };
  if (value === null || value === "") {
    delete patch[propertyKey];
  } else {
    patch[propertyKey] = value;
  }

  ctx.store.mergeRelationshipProperties(sourceNodeId, targetNodeId, type, patch);
  syncAfterRelationshipsWrite(ctx);
  return null;
}

export function updateDatabaseRowProperty(
  ctx: TomeWriteContext,
  databaseId: string,
  nodeId: string,
  propertyKey: string,
  value: string | null,
): RelationshipPropertyUpdateError | null {
  for (const type of TYPE_MEMBERSHIP_TYPES) {
    const connection = ctx.store.findRelationship(nodeId, databaseId, type);
    if (connection) {
      return updateOutgoingRelationshipProperty(
        ctx,
        nodeId,
        databaseId,
        type,
        propertyKey,
        value,
      );
    }
  }
  return "not_found";
}
