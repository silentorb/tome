import type { PrimitiveValue } from "imp-spec";
import type { RelationalSchema } from "imp-sql";
import { encodePropertyLiteral as encodeEnumPropertyLiteral } from "tome-flatfile/enum-property-codec";
import type { SchemaFile } from "tome-flatfile/schema-file";

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const ASSOCIATION_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Map logical Imp column names onto the Tome `nodes` SQLite table. */
export function tomeNodesColumnExpression(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`Invalid column name "${name}"`);
  }
  if (name === "id" || name === "is_archived") {
    return name;
  }
  return `json_extract(properties, '$.${name}')`;
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
  edges: {
    table: "relationship_projections",
    sourceColumn: "source_node_id",
    targetColumn: "target_node_id",
    typeColumn: "type",
    propertiesColumn: "properties",
  },
  edgeType(association: string, direction: number) {
    if (direction !== 0 && direction !== 1) {
      throw new Error(`direction must be 0 or 1, got ${String(direction)}`);
    }
    const trimmed = association.trim();
    const encoded = /^([0-9A-HJKMNP-TV-Z]{26}):([01])$/.exec(trimmed);
    if (encoded) {
      const encodedDir = Number(encoded[2]) as 0 | 1;
      if (encodedDir !== direction) {
        throw new Error(
          `traverse direction ${direction} does not match encoded projection "${trimmed}"`,
        );
      }
      return trimmed;
    }
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
