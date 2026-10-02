import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import {
  getPriorityDefault,
  isPriorityColumnKey,
  isPriorityValue,
  isUnsetPriority,
} from "./property-enums";
import { setRoleProjectionTypesForNode } from "tome-flatfile";
import {
  writeStoreContentDir,
  writeStoreFindRelationship,
  writeStoreMergeRelationshipProperties,
} from "./graph-store/relationship-write";
import type { RelationshipPropertyUpdateError } from "tome-graph-interfaces";

export type { RelationshipPropertyUpdateError } from "tome-graph-interfaces";

export async function updateOutgoingRelationshipProperty(
  ctx: TomeWriteContext,
  sourceNodeId: string,
  targetNodeId: string,
  type: string,
  propertyKey: string,
  value: string | null,
): Promise<RelationshipPropertyUpdateError | null> {
  const store = ctx.graphStore;
  const connection = await writeStoreFindRelationship(store, sourceNodeId, targetNodeId, type);
  if (!connection) return "not_found";

  if (isPriorityColumnKey(propertyKey)) {
    const defaultPriority = getPriorityDefault();
    const resolved: string = isUnsetPriority(value) ? defaultPriority : (value ?? defaultPriority);
    if (!isPriorityValue(resolved)) return "invalid_value";
    await writeStoreMergeRelationshipProperties(store, sourceNodeId, targetNodeId, type, {
      ...connection.properties,
      [propertyKey]: resolved,
    });
    await syncAfterRelationshipsWrite(ctx);
    return null;
  }

  const patch: Properties = { ...connection.properties };
  if (value === null || value === "") {
    delete patch[propertyKey];
  } else {
    patch[propertyKey] = value;
  }

  await writeStoreMergeRelationshipProperties(store, sourceNodeId, targetNodeId, type, patch);
  await syncAfterRelationshipsWrite(ctx);
  return null;
}

export async function updateDatabaseRowProperty(
  ctx: TomeWriteContext,
  databaseId: string,
  nodeId: string,
  propertyKey: string,
  value: string | null,
): Promise<RelationshipPropertyUpdateError | null> {
  const [, memberPerspective] = setRoleProjectionTypesForNode(
    databaseId,
    writeStoreContentDir(ctx.graphStore),
  );
  const connection = await writeStoreFindRelationship(
    ctx.graphStore,
    nodeId,
    databaseId,
    memberPerspective,
  );
  if (connection) {
    return updateOutgoingRelationshipProperty(
      ctx,
      nodeId,
      databaseId,
      memberPerspective,
      propertyKey,
      value,
    );
  }
  return "not_found";
}
