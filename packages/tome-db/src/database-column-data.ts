import { listRelationConnectionsForRow } from "./database-view-relations";
import { TYPE_MEMBERSHIP_TYPES } from "./labels";
import { unlinkOutgoingRelationship } from "./relationship-link-mutations";
import { otherEndpoint } from "./relationship-traverse";
import { relationType } from "./relation-type";
import type { TomeWriteContext } from "./content/write-context";
import type { TableColumnDef } from "./content/table-schemas-file";

export const ROW_META_KEYS = new Set(["view", "row_index", "row_name", "order"]);

export function stripScalarFromMembershipEdges(
  ctx: TomeWriteContext,
  databaseId: string,
  propertyKey: string,
): number {
  let count = 0;
  for (const type of TYPE_MEMBERSHIP_TYPES) {
    for (const connection of ctx.db.listRelationshipsToTarget(databaseId, type)) {
      if (!(propertyKey in connection.properties)) continue;
      const props = { ...connection.properties };
      delete props[propertyKey];
      ctx.store.replaceRelationshipProperties(
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

export function renameScalarOnMembershipEdges(
  ctx: TomeWriteContext,
  databaseId: string,
  oldKey: string,
  newKey: string,
): number {
  let count = 0;
  for (const type of TYPE_MEMBERSHIP_TYPES) {
    for (const connection of ctx.db.listRelationshipsToTarget(databaseId, type)) {
      if (!(oldKey in connection.properties)) continue;
      const props = { ...connection.properties };
      props[newKey] = props[oldKey];
      delete props[oldKey];
      ctx.store.replaceRelationshipProperties(
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
  const connectionType = column.perspective ?? relationType(column.name);
  const targetDatabaseId = column.targetTypeId;

  const rowIds = new Set<string>();
  for (const type of TYPE_MEMBERSHIP_TYPES) {
    for (const connection of ctx.db.listRelationshipsToTarget(databaseId, type)) {
      rowIds.add(connection.sourceNodeId);
    }
  }

  const toUnlink: Array<{ rowId: string; targetId: string }> = [];
  for (const rowId of rowIds) {
    const relationships = listRelationConnectionsForRow(
      ctx.db,
      rowId,
      connectionType,
      databaseId,
      targetDatabaseId,
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
