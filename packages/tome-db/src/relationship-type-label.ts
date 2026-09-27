import type {
  PerspectiveLabelConfig,
  RelationshipTypesFile,
} from "tome-flatfile/relationship-types-file";
import {
  normalizeRelationshipTypeId,
  parseProjectionType,
  perspectiveConfigAt,
  perspectiveLinkAdd,
  perspectiveTitle,
} from "tome-flatfile/relationship-types-file";

/** Title-case an arbitrary underscore/slug-like string (legacy helpers / fallbacks). */
export function formatRelationshipTypeLabel(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function configForEndpoint(
  registry: RelationshipTypesFile,
  relationshipTypeId: string,
  endpointIndex: 0 | 1,
): PerspectiveLabelConfig | null {
  const def = registry.relationshipTypes[normalizeRelationshipTypeId(relationshipTypeId)];
  if (!def) return null;
  return perspectiveConfigAt(def, endpointIndex);
}

/**
 * Section heading for an relationship type endpoint.
 * `typeOrProjection` may be a relationship type ULID (defaults to endpoint 0) or
 * a directed projection type (`ULID:0` / `ULID:1`).
 */
export function perspectiveDisplayLabel(
  registry: RelationshipTypesFile,
  typeOrProjection: string,
  relationshipTypeId?: string,
): string {
  const parsed = parseProjectionType(typeOrProjection);
  const id = normalizeRelationshipTypeId(
    relationshipTypeId ?? parsed?.relationshipTypeId ?? typeOrProjection,
  );
  const index = parsed?.endpointIndex ?? 0;
  const config = configForEndpoint(registry, id, index);
  if (config) return perspectiveTitle(config);
  return formatRelationshipTypeLabel(typeOrProjection);
}

/** Map projection types to picker options with perspective labels. */
export function labeledRelationshipTypes(
  registry: RelationshipTypesFile,
  types: readonly string[],
): { type: string; label: string }[] {
  return types.map((type) => ({
    type,
    label: perspectiveDisplayLabel(registry, type),
  }));
}

function defaultLinkAddLabel(sectionTitle: string): string {
  const singular = sectionTitle.replace(/s$/i, "") || "record";
  return `Link ${singular}`;
}

/** Inline link-existing control label for a relation section. */
export function perspectiveLinkAddLabel(
  registry: RelationshipTypesFile,
  typeOrProjection: string,
  sectionTitle: string,
  relationshipTypeId?: string,
): string {
  const parsed = parseProjectionType(typeOrProjection);
  const id = normalizeRelationshipTypeId(
    relationshipTypeId ?? parsed?.relationshipTypeId ?? typeOrProjection,
  );
  const index = parsed?.endpointIndex ?? 0;
  const config = configForEndpoint(registry, id, index);
  if (config) {
    const linkAdd = perspectiveLinkAdd(config);
    if (linkAdd) return linkAdd;
  }
  return defaultLinkAddLabel(sectionTitle);
}
