import type {
  PerspectiveLabelConfig,
  RelationshipTypesFile,
} from "tome-flatfile";
import { normalizeRelationshipType } from "tome-flatfile/relation-type";

/** Human-readable label for a local relationship type (e.g. `bible_passages` → `Bible Passages`). */
export function formatRelationshipTypeLabel(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function perspectiveLabelConfig(
  registry: RelationshipTypesFile,
  perspective: string,
  compositeType?: string,
): PerspectiveLabelConfig | null {
  const normalized = normalizeRelationshipType(perspective);
  // Preferred: resolve the label from the specific composite so a perspective
  // slug shared by several edge types (e.g. "inspirations") maps to the label
  // authored for THIS type + position, not the first arbitrary registry match.
  if (compositeType) {
    const def = registry.types[normalizeRelationshipType(compositeType)];
    return def?.perspectiveLabels?.[normalized] ?? null;
  }
  for (const def of Object.values(registry.types)) {
    if (!def.perspectives.includes(normalized)) continue;
    const label = def.perspectiveLabels?.[normalized];
    if (label !== undefined) return label;
  }
  return null;
}

function titleFromPerspectiveLabelConfig(config: PerspectiveLabelConfig): string {
  return typeof config === "string" ? config : config.title;
}

function linkAddFromPerspectiveLabelConfig(config: PerspectiveLabelConfig): string | null {
  return typeof config === "string" ? null : (config.linkAdd ?? null);
}

/**
 * Section heading for a perspective; falls back to formatRelationshipTypeLabel.
 * Pass `compositeType` to resolve the label from that specific edge type (tuple
 * position), avoiding ambiguity when a slug is shared across composites.
 */
export function perspectiveDisplayLabel(
  registry: RelationshipTypesFile,
  perspective: string,
  compositeType?: string,
): string {
  const config = perspectiveLabelConfig(registry, perspective, compositeType);
  if (config) return titleFromPerspectiveLabelConfig(config);
  return formatRelationshipTypeLabel(perspective);
}

function defaultLinkAddLabel(sectionTitle: string): string {
  const singular = sectionTitle.replace(/s$/i, "") || "record";
  return `Link ${singular}`;
}

/** Inline link-existing control label for a relation section. */
export function perspectiveLinkAddLabel(
  registry: RelationshipTypesFile,
  perspective: string,
  sectionTitle: string,
  compositeType?: string,
): string {
  const config = perspectiveLabelConfig(registry, perspective, compositeType);
  if (config) {
    const linkAdd = linkAddFromPerspectiveLabelConfig(config);
    if (linkAdd) return linkAdd;
  }
  return defaultLinkAddLabel(sectionTitle);
}
