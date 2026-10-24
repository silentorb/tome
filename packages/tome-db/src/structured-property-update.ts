import type { Properties, PropertyValue } from "tome-graph-interfaces";
import type { RelationshipPropertyUpdateError } from "tome-graph-interfaces";
import type { TomeWriteContext } from "./content/write-context";
import {
  mergeNodePropertiesOnContent,
  syncAfterRelationshipsWrite,
} from "./content/write-context";
import { loadTableSchemaForDatabase } from "./database-column-defs";
import {
  columnStorage,
  findColumnByKey,
  isStructuredColumnType,
  setRoleProjectionTypesForNode,
} from "tome-flatfile";
import { isMemberOfTypeTable } from "./predicate-membership";
import {
  writeStoreContentDir,
  writeStoreFindRelationship,
  writeStoreMergeRelationshipProperties,
  writeStoreUpsertRelationship,
} from "./graph-store/relationship-write";

export type StructuredPropertyUpdateError =
  | RelationshipPropertyUpdateError
  | "invalid_column"
  | "invalid_value";

function asPropertyValue(value: unknown): PropertyValue | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => asPropertyValue(item) ?? null) as PropertyValue;
  }
  if (typeof value === "object") {
    const out: Record<string, PropertyValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const coerced = asPropertyValue(v);
      if (coerced !== null) out[k] = coerced;
    }
    return out;
  }
  return null;
}

/**
 * Update a structured table-schema column (`imp_graph` / `json`) on a node,
 * writing to node frontmatter or the membership-edge bag per column `storage`.
 */
export async function updateStructuredProperty(
  ctx: TomeWriteContext,
  nodeId: string,
  databaseId: string,
  propertyKey: string,
  value: unknown,
): Promise<StructuredPropertyUpdateError | null> {
  const contentDir = writeStoreContentDir(ctx.graphStore);
  const schema = loadTableSchemaForDatabase(databaseId, contentDir);
  if (!schema) return "invalid_column";
  const col = findColumnByKey(schema, propertyKey);
  if (!col || !isStructuredColumnType(col.type)) return "invalid_column";

  const storage = columnStorage(col as { storage?: "node" | "edge" });
  const coerced = asPropertyValue(value);

  if (storage === "node") {
    const patch: Properties = {};
    if (coerced === null) {
      // Clear by setting null — flatfile merge should delete; use explicit null.
      patch[propertyKey] = null;
    } else {
      patch[propertyKey] = coerced;
    }
    const ok = await mergeNodePropertiesOnContent(ctx, nodeId, patch);
    return ok ? null : "not_found";
  }

  // Edge storage: ensure membership carrier, then merge object value.
  const [, memberPerspective] = setRoleProjectionTypesForNode(databaseId, contentDir);
  let connection = await writeStoreFindRelationship(
    ctx.graphStore,
    nodeId,
    databaseId,
    memberPerspective,
  );
  if (!connection) {
    if (!(await isMemberOfTypeTable(ctx.graphStore, nodeId, databaseId, contentDir))) {
      return "not_found";
    }
    await writeStoreUpsertRelationship(
      ctx.graphStore,
      nodeId,
      databaseId,
      memberPerspective,
      {},
    );
    await syncAfterRelationshipsWrite(ctx);
    connection = await writeStoreFindRelationship(
      ctx.graphStore,
      nodeId,
      databaseId,
      memberPerspective,
    );
    if (!connection) return "not_found";
  }

  const patch: Properties = { ...connection.properties };
  if (coerced === null) {
    delete patch[propertyKey];
  } else {
    patch[propertyKey] = coerced;
  }
  await writeStoreMergeRelationshipProperties(
    ctx.graphStore,
    nodeId,
    databaseId,
    memberPerspective,
    patch,
  );
  await syncAfterRelationshipsWrite(ctx);
  return null;
}
