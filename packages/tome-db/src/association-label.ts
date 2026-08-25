import type {
  PerspectiveLabelConfig,
  AssociationsFile,
} from "tome-flatfile/associations-file";
import {
  normalizeAssociationId,
  parseProjectionType,
  perspectiveConfigAt,
  perspectiveLinkAdd,
  perspectiveTitle,
} from "tome-flatfile/associations-file";

/** Title-case an arbitrary underscore/slug-like string (legacy helpers / fallbacks). */
export function formatAssociationLabel(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function configForEndpoint(
  registry: AssociationsFile,
  associationId: string,
  endpointIndex: 0 | 1,
): PerspectiveLabelConfig | null {
  const def = registry.associations[normalizeAssociationId(associationId)];
  if (!def) return null;
  return perspectiveConfigAt(def, endpointIndex);
}

/**
 * Section heading for an association endpoint.
 * `typeOrProjection` may be an association ULID (defaults to endpoint 0) or
 * a directed projection type (`ULID:0` / `ULID:1`).
 */
export function perspectiveDisplayLabel(
  registry: AssociationsFile,
  typeOrProjection: string,
  associationId?: string,
): string {
  const parsed = parseProjectionType(typeOrProjection);
  const id = normalizeAssociationId(
    associationId ?? parsed?.associationId ?? typeOrProjection,
  );
  const index = parsed?.endpointIndex ?? 0;
  const config = configForEndpoint(registry, id, index);
  if (config) return perspectiveTitle(config);
  return formatAssociationLabel(typeOrProjection);
}

/** Map projection types to picker options with perspective labels. */
export function labeledRelationshipTypes(
  registry: AssociationsFile,
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
  registry: AssociationsFile,
  typeOrProjection: string,
  sectionTitle: string,
  associationId?: string,
): string {
  const parsed = parseProjectionType(typeOrProjection);
  const id = normalizeAssociationId(
    associationId ?? parsed?.associationId ?? typeOrProjection,
  );
  const index = parsed?.endpointIndex ?? 0;
  const config = configForEndpoint(registry, id, index);
  if (config) {
    const linkAdd = perspectiveLinkAdd(config);
    if (linkAdd) return linkAdd;
  }
  return defaultLinkAddLabel(sectionTitle);
}
