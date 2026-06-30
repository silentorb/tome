import type {
  PerspectiveLabelConfig,
  RelationshipTypesFile,
} from "./content/relationship-types-file";
import { normalizeRelationshipType } from "./relation-type";

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
): PerspectiveLabelConfig | null {
  const normalized = normalizeRelationshipType(perspective);
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

/** Section heading for a perspective; falls back to formatRelationshipTypeLabel. */
export function perspectiveDisplayLabel(
  registry: RelationshipTypesFile,
  perspective: string,
): string {
  const config = perspectiveLabelConfig(registry, perspective);
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
): string {
  const config = perspectiveLabelConfig(registry, perspective);
  if (config) {
    const linkAdd = linkAddFromPerspectiveLabelConfig(config);
    if (linkAdd) return linkAdd;
  }
  return defaultLinkAddLabel(sectionTitle);
}
