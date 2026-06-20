import type { DatabaseColumnDef } from "../database-view";
import type { GraphDatabase } from "../graph";
import type { EvalRow } from "../row-sort";
import { loadDynamicColumnSets, loadDynamicFields } from "./overlay";
import {
  isFieldVisibleForView,
  materializeColumnKey,
  materializeColumnName,
  type MaterializedColumnSetColumn,
  type ResolverRegistry,
} from "./registry";
import {
  buildAllSceneCountPrefetch,
  buildSceneCountByProductPrefetch,
  buildWeightedUsePrefetch,
  buildWonderPrefetch,
} from "./resolvers/index";

export interface DynamicEnrichmentResult {
  rows: EvalRow[];
  dynamicColumnDefs: DatabaseColumnDef[];
  hiddenColumnKeys: Set<string>;
}

export interface ApplyDynamicFieldsOptions {
  /** When true, include all overlay-bound fields regardless of view-tab bindings. */
  allViews?: boolean;
  /** Content directory for dynamic-fields.json (defaults to TOME_CONTENT_PATH / repo content/). */
  contentDir?: string;
}

function fieldVisible(
  viewNames: string[],
  viewName: string,
  options?: ApplyDynamicFieldsOptions,
): boolean {
  if (options?.allViews) return true;
  return isFieldVisibleForView(viewNames, viewName);
}

function buildFixedPrefetch(
  resolverId: string,
  ctx: { db: GraphDatabase; databaseId: string; viewName: string; rowNodeIds: string[] },
  params: Record<string, unknown>,
): unknown {
  switch (resolverId) {
    case "characters.allSceneCount":
      return buildAllSceneCountPrefetch(ctx, params);
    case "inspirations.weightedUse":
      return buildWeightedUsePrefetch(ctx, params);
    case "inspirations.wonder":
      return buildWonderPrefetch(ctx, params);
    default:
      return undefined;
  }
}

export function applyDynamicFields(
  db: GraphDatabase,
  databaseId: string,
  viewName: string,
  evalRows: EvalRow[],
  registry: ResolverRegistry,
  options?: ApplyDynamicFieldsOptions,
): DynamicEnrichmentResult {
  const fields = loadDynamicFields(db, databaseId, options?.contentDir);
  const columnSets = loadDynamicColumnSets(db, databaseId, options?.contentDir);

  const dynamicColumnDefs: DatabaseColumnDef[] = [];
  const hiddenColumnKeys = new Set<string>();
  const materializedSetColumns: MaterializedColumnSetColumn[] = [];

  const rowNodeIds = evalRows.map((r) => r.nodeId);
  const ctx = { db, databaseId, viewName, rowNodeIds };

  const setPrefetches = new Map<string, unknown>();
  const fixedPrefetches = new Map<string, unknown>();

  for (const set of columnSets) {
    if (!fieldVisible(set.viewNames, viewName, options)) continue;
    for (const key of set.hideLegacyKeys) hiddenColumnKeys.add(key);

    const resolver = registry.columnSets.get(set.resolverId);
    if (!resolver) continue;

    let prefetch = setPrefetches.get(set.id);
    if (!prefetch) {
      prefetch = resolver.buildPrefetch(ctx, set.params);
      setPrefetches.set(set.id, prefetch);
    }

    const dimensions = resolver.discoverDimensions(ctx, set.params);
    for (const dimension of dimensions) {
      materializedSetColumns.push({
        setId: set.id,
        dimensionId: dimension.id,
        key: materializeColumnKey(set.columnKeyPattern, dimension.id),
        name: materializeColumnName(set.columnNamePattern, dimension.title),
        type: set.columnType,
        resolverId: set.resolverId,
        params: set.params,
      });
    }
  }

  for (const field of fields) {
    if (!fieldVisible(field.viewNames, viewName, options)) continue;
    if (!fixedPrefetches.has(field.resolverId)) {
      fixedPrefetches.set(
        field.resolverId,
        buildFixedPrefetch(field.resolverId, ctx, field.params),
      );
    }
    dynamicColumnDefs.push({
      key: field.columnKey,
      name: field.columnName,
      type: field.columnType,
      source: "dynamic",
    });
  }

  for (const col of materializedSetColumns) {
    dynamicColumnDefs.push({
      key: col.key,
      name: col.name,
      type: col.type,
      source: "dynamic",
    });
  }

  if (fields.length === 0 && materializedSetColumns.length === 0) {
    return { rows: evalRows, dynamicColumnDefs: [], hiddenColumnKeys };
  }

  const finalRows = evalRows.map((row) => {
    const cells = { ...row.cells };

    for (const field of fields) {
      if (!fieldVisible(field.viewNames, viewName, options)) continue;
      const resolver = registry.fixed.get(field.resolverId);
      if (!resolver) continue;
      const prefetch = fixedPrefetches.get(field.resolverId);
      cells[field.columnKey] = resolver(ctx, field.params, row.nodeId, prefetch);
    }

    for (const col of materializedSetColumns) {
      const resolver = registry.columnSets.get(col.resolverId);
      if (!resolver) continue;
      const prefetch = setPrefetches.get(col.setId);
      cells[col.key] = resolver.resolveCell(
        ctx,
        col.params,
        row.nodeId,
        col.dimensionId,
        prefetch,
      );
    }

    return { ...row, cells };
  });

  return {
    rows: finalRows,
    dynamicColumnDefs,
    hiddenColumnKeys,
  };
}
