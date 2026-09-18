import type { PrimitiveValue } from "imp-core-types";
import type { RelationalSchema } from "imp-sql";
import { encodePropertyLiteral as encodeEnumPropertyLiteral } from "tome-flatfile/enum-property-codec";
import type { SchemaFile } from "tome-flatfile/schema-file";

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const ASSOCIATION_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Keep in sync with `PROMOTED_NODE_COLUMNS` in tome-sqlite/schema.ts. */
const PROMOTED_NODE_COLUMNS = new Set([
  "title",
  "alias",
  "body",
  "created_at",
  "modified_at",
]);

/** Keep in sync with `PROMOTED_RELATIONSHIP_COLUMNS` in tome-sqlite/schema.ts. */
const PROMOTED_RELATIONSHIP_COLUMNS = new Set(["ordinal", "order", "priority"]);

/** Rebuild a JSON bag from promoted node columns for Imp traverse `json_patch`. */
export function tomeNodePropertiesJson(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error(`Invalid table alias "${alias}"`);
  }
  return `json_object('title', ${alias}.title, 'alias', ${alias}.alias, 'body', ${alias}.body, 'created_at', ${alias}.created_at, 'modified_at', ${alias}.modified_at)`;
}

/**
 * Rebuild a JSON bag from promoted edge columns + EAV for Imp traverse `json_patch`.
 * EAV values are already JSON-encoded PropertyValue text.
 */
export function tomeEdgePropertiesJson(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error(`Invalid table alias "${alias}"`);
  }
  return `json_patch(json_object('ordinal', ${alias}.ordinal, 'order', ${alias}."order", 'priority', ${alias}.priority), coalesce((SELECT json_group_object(key, json(value)) FROM relationship_projection_properties WHERE projection_id = ${alias}.id), '{}'))`;
}

/** Map logical Imp column names onto the Tome `nodes` SQLite table. */
export function tomeNodesColumnExpression(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Invalid column name "${name}"`);
  }
  if (name === "id" || name === "is_archived" || PROMOTED_NODE_COLUMNS.has(name)) {
    return name;
  }
  return `(SELECT json_extract(value, '$') FROM node_properties WHERE node_id = nodes.id AND key = '${name}')`;
}

/** Map logical edge property names onto `relationship_projections` (+ EAV). */
export function tomeEdgePropertyExpression(alias: string, name: string): string {
  if (!IDENT_RE.test(alias)) {
    throw new Error(`Invalid edges alias "${alias}"`);
  }
  if (!IDENT_RE.test(name)) {
    throw new Error(`Invalid edge property name "${name}"`);
  }
  if (name === "order") {
    return `${alias}."order"`;
  }
  if (PROMOTED_RELATIONSHIP_COLUMNS.has(name)) {
    return `${alias}.${name}`;
  }
  return `(SELECT json_extract(value, '$') FROM relationship_projection_properties WHERE projection_id = ${alias}.id AND key = '${name}')`;
}

/**
 * Encode a directed association hop as a `relationship_projections.type` value
 * (`{associationId}:0` or `{associationId}:1`).
 */
export function projectionType(associationId: string, direction: 0 | 1): string {
  const id = associationId.trim();
  if (!ASSOCIATION_ID_RE.test(id)) {
    throw new Error(`Invalid association id "${associationId}"`);
  }
  if (direction !== 0 && direction !== 1) {
    throw new Error(`direction must be 0 or 1, got ${String(direction)}`);
  }
  return `${id}:${direction}`;
}

/** Imp RelationalSchema for live Tome nodes + relationship projection edges. */
const tomeLiveNodesSchemaBase = {
  table: "nodes",
  column: tomeNodesColumnExpression,
  nodePropertiesJson: tomeNodePropertiesJson,
  edges: {
    table: "relationship_projections",
    sourceColumn: "source_node_id",
    targetColumn: "target_node_id",
    typeColumn: "type",
    property: tomeEdgePropertyExpression,
    propertiesJson: tomeEdgePropertiesJson,
  },
  edgeType(association: string, direction: number) {
    if (direction !== 0 && direction !== 1) {
      throw new Error(`direction must be 0 or 1, got ${String(direction)}`);
    }
    // Imp graphs must pass bare association + direction; packing is SQL/storage only.
    return projectionType(association, direction as 0 | 1);
  },
} satisfies RelationalSchema;

/** Default schema without workspace enum binding (tests / callers without schema.json). */
export const tomeLiveNodesSchema: RelationalSchema = tomeLiveNodesSchemaBase;

/** Workspace-aware schema: encodes enum property literals to cache indices at compile time. */
export function createTomeLiveNodesSchema(schema?: SchemaFile): RelationalSchema {
  if (!schema) return tomeLiveNodesSchema;
  return {
    ...tomeLiveNodesSchemaBase,
    encodePropertyLiteral(propertyKey: string, authorValue: PrimitiveValue): PrimitiveValue {
      return encodeEnumPropertyLiteral(propertyKey, authorValue, schema) as PrimitiveValue;
    },
  };
}

function liveNodesSubquery(corpusPredicate = ""): string {
  const extra = corpusPredicate.trim() ? ` ${corpusPredicate.trim()}` : "";
  return `(select * from "nodes" where "is_archived" = 0${extra})`;
}

/**
 * Restrict Imp-compiled SQL to live (non-archived) nodes by rewriting
 * `FROM "nodes"` / `JOIN "nodes"` (including aliased joins from path ops).
 * Optional `corpusPredicate` (e.g. `and "id" in ('a')`) is pre-SQL corpus scoping.
 */
export function applyLiveNodesConstraint(
  sql: string,
  parameters: readonly unknown[],
  corpusPredicate?: string,
): { sql: string; parameters: unknown[] } {
  if (!/\b(?:from|join)\s+"nodes"/i.test(sql)) {
    throw new Error('Expected Imp query to select from or join "nodes"');
  }
  const subquery = liveNodesSubquery(corpusPredicate);
  const replaced = sql.replace(
    /\b(from|join)\s+"nodes"(\s+as\s+(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*))?/gi,
    (_match, keyword: string, asClause?: string) =>
      `${keyword} ${subquery}${asClause ?? ' as "nodes"'}`,
  );
  return { sql: replaced, parameters: [...parameters] };
}
