import { listRelationConnectionsForRow } from "./database-view-relations";
import { unlinkOutgoingRelationship } from "./relationship-link-mutations";
import { otherEndpoint } from "./relationship-traverse";
import { loadAssociationsFromContent } from "tome-flatfile";
import { setTraitProjectionTypes } from "tome-flatfile";
import { projectionTypeForRelationColumn, relationColumnCompositeType } from "tome-flatfile";
import type { TomeWriteContext } from "./content/write-context";
import { listRelationshipsToTarget } from "./graph-store/relationship-read";
import {
  writeStoreContentDir,
  writeStoreReplaceRelationshipProperties,
} from "./graph-store/relationship-write";
import type { TableColumnDef } from "tome-flatfile";

export const ROW_META_KEYS = new Set(["row_name", "order", "row_index", "number"]);

export function stripScalarFromSetEdges(
  ctx: TomeWriteContext,
  databaseId: string,
  propertyKey: string,
): number {
  const store = ctx.graphStore;
  const registry = loadAssociationsFromContent(writeStoreContentDir(store));
  let count = 0;
  for (const type of setTraitProjectionTypes(registry)) {
    for (const connection of listRelationshipsToTarget(store, databaseId, type)) {
      if (!(propertyKey in connection.properties)) continue;
      const props = { ...connection.properties };
      delete props[propertyKey];
      writeStoreReplaceRelationshipProperties(
        store,
        connection.sourceNodeId,
        connection.targetNodeId,
        type,
        props,
      );
      count++;
    }
  }
  return count;
}

export function renameScalarOnSetEdges(
  ctx: TomeWriteContext,
  databaseId: string,
  oldKey: string,
  newKey: string,
): number {
  const store = ctx.graphStore;
  const registry = loadAssociationsFromContent(writeStoreContentDir(store));
  let count = 0;
  for (const type of setTraitProjectionTypes(registry)) {
    for (const connection of listRelationshipsToTarget(store, databaseId, type)) {
      if (!(oldKey in connection.properties)) continue;
      const props = { ...connection.properties };
      props[newKey] = props[oldKey];
      delete props[oldKey];
      writeStoreReplaceRelationshipProperties(
        store,
        connection.sourceNodeId,
        connection.targetNodeId,
        type,
        props,
      );
      count++;
    }
  }
  return count;
}

export function unlinkRelationColumnFromAllRows(
  ctx: TomeWriteContext,
  databaseId: string,
  column: TableColumnDef & { type: "relation" },
): number {
  const store = ctx.graphStore;
  const contentDir = writeStoreContentDir(store);
  const registry = loadAssociationsFromContent(contentDir);
  const connectionType = projectionTypeForRelationColumn(registry, databaseId, column);
  const compositeType = relationColumnCompositeType(column);

  const rowIds = new Set<string>();
  for (const type of setTraitProjectionTypes(registry)) {
    for (const connection of listRelationshipsToTarget(store, databaseId, type)) {
      rowIds.add(connection.sourceNodeId);
    }
  }

  const toUnlink: Array<{ rowId: string; targetId: string }> = [];
  for (const rowId of rowIds) {
    const relationships = listRelationConnectionsForRow(
      store,
      rowId,
      connectionType,
      databaseId,
      compositeType,
      contentDir,
    );
    for (const relationship of relationships) {
      toUnlink.push({ rowId, targetId: otherEndpoint(relationship, rowId) });
    }
  }

  let unlinked = 0;
  for (const { rowId, targetId } of toUnlink) {
    if (unlinkOutgoingRelationship(ctx, rowId, targetId, connectionType) === null) {
      unlinked++;
    }
  }
  return unlinked;
}
