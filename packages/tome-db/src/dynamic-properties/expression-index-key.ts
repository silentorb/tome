/**
 * Content-addressed expression index keys: DynAggregate (or later Imp) digest + context fingerprint.
 */

import { createHash } from "node:crypto";
import {
  loadAssociationsFromContent,
  loadSchemaFromContent,
  resolveContentPath,
} from "tome-flatfile";
import {
  canonicalizeDynAggregate,
  fixedAggregateForResolver,
  type DynAggregateSpec,
} from "./aggregate";

/** Bump when index table layout or digest payload meaning changes. */
export const EXPRESSION_INDEX_FORMAT_VERSION = 1;

export interface ExpressionIndexKeyParts {
  digest: string;
  canonicalExpression: unknown;
  contextFingerprint: Record<string, unknown>;
}

export function hashExpressionIndexKey(
  canonicalExpression: unknown,
  contextFingerprint: Record<string, unknown>,
): string {
  const payload = JSON.stringify({
    expression: canonicalExpression,
    context: contextFingerprint,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/**
 * Context that changes meaning without changing the aggregate shape.
 * Omit limit/offset / request identity.
 */
export function buildExpressionIndexContextFingerprint(contentDir?: string): Record<string, unknown> {
  const dir = contentDir ?? resolveContentPath();
  const schema = loadSchemaFromContent(dir);
  const associations = loadAssociationsFromContent(dir);
  const priority = schema.enums?.priority;
  return {
    formatVersion: EXPRESSION_INDEX_FORMAT_VERSION,
    contentDir: dir,
    priorityOptions: priority?.options ?? [],
    priorityValues: priority?.values ?? {},
    priorityDefault: priority?.default ?? null,
    associationIds: Object.keys(associations.associations ?? {}).sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

export function expressionIndexKeyForFixedDyn(
  resolverId: string,
  params: Record<string, unknown>,
  contentDir?: string,
): ExpressionIndexKeyParts | null {
  const spec = fixedAggregateForResolver(resolverId);
  if (!spec) return null;
  return expressionIndexKeyForAggregate(resolverId, spec, params, contentDir);
}

export function expressionIndexKeyForAggregate(
  resolverId: string,
  spec: DynAggregateSpec,
  params: Record<string, unknown>,
  contentDir?: string,
): ExpressionIndexKeyParts {
  const canonicalExpression = canonicalizeDynAggregate(resolverId, spec, params);
  const contextFingerprint = buildExpressionIndexContextFingerprint(contentDir);
  const digest = hashExpressionIndexKey(canonicalExpression, contextFingerprint);
  return { digest, canonicalExpression, contextFingerprint };
}
