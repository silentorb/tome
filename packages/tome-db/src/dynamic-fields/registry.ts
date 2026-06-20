import type { GraphDatabase } from "../graph";
import type { EvalRow } from "../row-sort";

export type DynamicFieldParams = Record<string, unknown>;

export interface DynamicResolverContext {
  db: GraphDatabase;
  databaseId: string;
  viewName: string;
  rowNodeIds: string[];
}

export interface ColumnSetDimension {
  id: string;
  title: string;
}

export interface ColumnSetResolver {
  discoverDimensions(ctx: DynamicResolverContext, params: DynamicFieldParams): ColumnSetDimension[];
  resolveCell(
    ctx: DynamicResolverContext,
    params: DynamicFieldParams,
    nodeId: string,
    dimensionId: string,
    prefetch: unknown,
  ): string;
  buildPrefetch(ctx: DynamicResolverContext, params: DynamicFieldParams): unknown;
}

export type FixedFieldResolver = (
  ctx: DynamicResolverContext,
  params: DynamicFieldParams,
  nodeId: string,
  prefetch: unknown,
) => string;

export interface ResolverRegistry {
  fixed: Map<string, FixedFieldResolver>;
  columnSets: Map<string, ColumnSetResolver>;
}

export function createResolverRegistry(): ResolverRegistry {
  return {
    fixed: new Map(),
    columnSets: new Map(),
  };
}

export function registerFixedResolver(
  registry: ResolverRegistry,
  id: string,
  resolver: FixedFieldResolver,
): void {
  registry.fixed.set(id, resolver);
}

export function registerColumnSetResolver(
  registry: ResolverRegistry,
  id: string,
  resolver: ColumnSetResolver,
): void {
  registry.columnSets.set(id, resolver);
}

export interface MaterializedColumnSetColumn {
  setId: string;
  dimensionId: string;
  key: string;
  name: string;
  type: string;
  resolverId: string;
  params: DynamicFieldParams;
}

export function materializeColumnKey(pattern: string, dimensionId: string): string {
  return pattern.replace("{productId}", dimensionId).replace("{dimensionId}", dimensionId);
}

export function materializeColumnName(pattern: string, dimensionTitle: string): string {
  return pattern.replace("{productTitle}", dimensionTitle).replace("{dimensionTitle}", dimensionTitle);
}

export function applyPattern(text: string, dimension: ColumnSetDimension): string {
  return text
    .replace("{productId}", dimension.id)
    .replace("{dimensionId}", dimension.id)
    .replace("{productTitle}", dimension.title)
    .replace("{dimensionTitle}", dimension.title);
}

export function isFieldVisibleForView(viewNames: string[], viewName: string): boolean {
  return viewNames.length === 0 || viewNames.includes(viewName);
}

export type { EvalRow };
