import type { RelationshipReadStore } from "../graph-store/relationship-read";
import { readStoreGetNode, readStoreListNodeIds } from "../graph-store/relationship-read";
import type { EvalRow } from "../row-sort";

export type DynamicPropertyParams = Record<string, unknown>;

export interface DynamicResolverContext {
  db: RelationshipReadStore;
  owner: string;
  viewName: string;
  rowNodeIds: string[];
}

export interface ColumnSetDimension {
  id: string;
  title: string;
}

export interface ColumnSetResolver {
  discoverDimensions(ctx: DynamicResolverContext, params: DynamicPropertyParams): ColumnSetDimension[];
  resolveCell(
    ctx: DynamicResolverContext,
    params: DynamicPropertyParams,
    nodeId: string,
    dimensionId: string,
    prefetch: unknown,
  ): string;
  buildPrefetch(ctx: DynamicResolverContext, params: DynamicPropertyParams): unknown;
}

export type FixedPropertyResolver = (
  ctx: DynamicResolverContext,
  params: DynamicPropertyParams,
  nodeId: string,
  prefetch: unknown,
) => string;

export interface ResolverRegistry {
  fixed: Map<string, FixedPropertyResolver>;
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
  resolver: FixedPropertyResolver,
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
  params: DynamicPropertyParams;
}

export function materializeColumnKey(pattern: string, dimensionId: string): string {
  return pattern.replace("{productId}", dimensionId).replace("{dimensionId}", dimensionId);
}

/**
 * Invert {@link materializeColumnKey} for a single `{productId}` / `{dimensionId}` placeholder.
 * Returns null when the pattern is ambiguous (multiple placeholders) or the key does not match.
 */
export function parseDimensionIdFromColumnKey(pattern: string, columnKey: string): string | null {
  const placeholders = ["{productId}", "{dimensionId}"].filter((p) => pattern.includes(p));
  if (placeholders.length !== 1) return null;
  const placeholder = placeholders[0]!;
  const idx = pattern.indexOf(placeholder);
  const prefix = pattern.slice(0, idx);
  const suffix = pattern.slice(idx + placeholder.length);
  if (!columnKey.startsWith(prefix) || !columnKey.endsWith(suffix)) return null;
  const dimensionId = columnKey.slice(prefix.length, columnKey.length - suffix.length);
  if (!dimensionId) return null;
  // Reject if re-materializing would not round-trip (embedded placeholder / mismatch).
  if (materializeColumnKey(pattern, dimensionId) !== columnKey) return null;
  return dimensionId;
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

export type { EvalRow };
