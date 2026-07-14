import { createHash } from "node:crypto";
import { relationshipKeyBytes } from "./ulid-bytes";
import { normalizeAssociationId } from "./associations-file";

/**
 * SHA-256 of authored composite key bytes (`a‖b‖type`), as 64 uppercase hex chars.
 * Order-sensitive — matches {@link relationshipRecordId} authored tuple order.
 */
export function relationshipDigest(a: string, b: string, type: string): string {
  const normalizedType = normalizeAssociationId(type);
  const key = relationshipKeyBytes(a, b, normalizedType);
  return createHash("sha256").update(key).digest("hex").toUpperCase();
}

/** Two-char shard directory from the digest prefix. */
export function relationshipShardDir(a: string, b: string, type: string): string {
  return relationshipDigest(a, b, type).slice(0, 2);
}

/**
 * Path relative to the live or archive relationships root:
 * `{shard}/{digestRest}.json`.
 */
export function relationshipRelativePath(a: string, b: string, type: string): string {
  const digest = relationshipDigest(a, b, type);
  return `${digest.slice(0, 2)}/${digest.slice(2)}.json`;
}
