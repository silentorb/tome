/**
 * Related-node id hops via Imp semantic paths (table-schema column keys).
 * Prefer this over listRelationshipsForComposite when only opposite node ids are needed.
 */

import type { PathOntology } from "imp-pathing";
import { mapPathOntology } from "imp-pathing";
import type { AssociationsFile, TableSchemasFile } from "tome-flatfile";
import type { TableRelationColumn } from "tome-graph-interfaces";
import {
  getTableSchema,
  loadAssociationsFromContent,
  loadTableSchemasFromContent,
  normalizeAssociationId,
  relationColumns,
  resolveContentPath,
  targetTypeIdForRelationColumn,
} from "tome-flatfile";
import type { ImpCollectionResult, TomeGraphStoreQueryable } from "tome-graph-interfaces";
import {
  isQueryableReadStore,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";
import { semanticPathFromAnchorGraph } from "./graph-store/standard-graphs";

export type SemanticRelatedPathContext = {
  associations: AssociationsFile;
  tableSchemas: TableSchemasFile;
  contentDir: string;
};

/** Load associations + table-schemas for composite→token resolution (no full PathOntology). */
export function loadSemanticRelatedPathContext(
  contentDir?: string,
): SemanticRelatedPathContext {
  const dir = contentDir ?? resolveContentPath();
  return {
    associations: loadAssociationsFromContent(dir),
    tableSchemas: loadTableSchemasFromContent(dir),
    contentDir: dir,
  };
}

/**
 * Resolve the table-schema relation column key for `associationId` on `startType`.
 * Fails if missing or ambiguous (multiple columns for the same association).
 */
export function relationTokenForAssociation(
  tableSchemas: TableSchemasFile,
  startType: string,
  associationId: string,
): string {
  return relationColumnForAssociation(tableSchemas, startType, associationId).key;
}

function relationColumnForAssociation(
  tableSchemas: TableSchemasFile,
  startType: string,
  associationId: string,
): TableRelationColumn {
  const normalized = normalizeAssociationId(associationId);
  const schema = getTableSchema(tableSchemas, startType);
  if (!schema) {
    throw new Error(
      `No table-schema for type "${startType}" while resolving association "${normalized}"`,
    );
  }
  const matches = relationColumns(schema).filter(
    (col): col is TableRelationColumn =>
      col.type === "relation" &&
      normalizeAssociationId(col.association) === normalized,
  );
  if (matches.length === 0) {
    throw new Error(
      `No relation column on type "${startType}" for association "${normalized}"`,
    );
  }
  if (matches.length > 1) {
    const keys = matches.map((col) => col.key).join(", ");
    throw new Error(
      `Ambiguous relation columns on type "${startType}" for association "${normalized}": ${keys}`,
    );
  }
  return matches[0]!;
}

/**
 * Minimal PathOntology for one relation hop — avoids createTomePathOntology over the
 * whole corpus (unrelated columns without endpoint typeIds would fail the host).
 */
function ontologyForRelationColumn(
  associations: AssociationsFile,
  startType: string,
  col: TableRelationColumn,
): PathOntology {
  const association = normalizeAssociationId(col.association);
  const nextType = targetTypeIdForRelationColumn(associations, startType, col);
  if (!nextType) {
    throw new Error(
      `Relation column "${col.key}" on type "${startType}" has no opposite endpoint typeId`,
    );
  }
  return mapPathOntology({
    [startType]: {
      [col.key]: {
        kind: "relationship",
        association,
        direction: col.endpoint,
        nextType,
      },
    },
  });
}

function requireQueryable(store: RelationshipReadStore): TomeGraphStoreQueryable {
  if (!isQueryableReadStore(store)) {
    throw new Error(
      "Semantic related-id hops require a Queryable graph store (executeImp)",
    );
  }
  return store as TomeGraphStoreQueryable;
}

function syncExecuteImp(
  store: TomeGraphStoreQueryable,
  ...args: Parameters<TomeGraphStoreQueryable["executeImp"]>
): ImpCollectionResult {
  const result = store.executeImp(...args);
  if (result instanceof Promise) {
    throw new Error("Semantic related-id hops require synchronous executeImp");
  }
  return result;
}

function idsFromImpResult(result: ImpCollectionResult): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of result.rows) {
    const raw = row.id;
    if (typeof raw !== "string" || !raw || seen.has(raw)) continue;
    seen.add(raw);
    ids.push(raw);
  }
  return ids;
}

/** Opposite node ids via one semantic relation hop from `anchorNodeId`. */
export function relatedNodeIdsFromSemanticPath(
  store: RelationshipReadStore,
  anchorNodeId: string,
  token: string,
  options: {
    startType: string;
    ontology: PathOntology;
  },
): string[] {
  const queryable = requireQueryable(store);
  // Relation hop only — project/asScalar emits unqualified `id` after traverse joins
  // (ambiguous sources.id vs targets.id). Node-bag output qualifies targets.id like
  // typeMembersGraph / outgoingRelationshipsGraph.
  const graph = semanticPathFromAnchorGraph(anchorNodeId, [token], {
    ontology: options.ontology,
    startType: options.startType,
  });
  return idsFromImpResult(syncExecuteImp(queryable, graph));
}

/**
 * Opposite node ids for a presentation composite: resolve association → column key,
 * then Imp semantic bind + executeImp. No composite-SQL fallback.
 */
export function relatedNodeIds(
  store: RelationshipReadStore,
  anchorNodeId: string,
  associationId: string,
  startType: string,
  pathContext: SemanticRelatedPathContext,
): string[] {
  const col = relationColumnForAssociation(
    pathContext.tableSchemas,
    startType,
    associationId,
  );
  const ontology = ontologyForRelationColumn(
    pathContext.associations,
    startType,
    col,
  );
  return relatedNodeIdsFromSemanticPath(store, anchorNodeId, col.key, {
    startType,
    ontology,
  });
}

export function firstRelatedNodeId(
  store: RelationshipReadStore,
  anchorNodeId: string,
  associationId: string,
  startType: string,
  pathContext: SemanticRelatedPathContext,
): string | null {
  return relatedNodeIds(store, anchorNodeId, associationId, startType, pathContext)[0] ?? null;
}
