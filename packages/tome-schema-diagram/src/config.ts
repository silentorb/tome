export type SchemaDiagramDirection = "TB" | "LR";

export type SchemaDiagramTheme = "default" | "dark" | "forest" | "neutral";

export type SchemaDiagramMemberBadgePosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export const DEFAULT_SCHEMA_DIAGRAM_MEMBER_BADGE_POSITION: SchemaDiagramMemberBadgePosition =
  "bottom-right";

const MEMBER_BADGE_POSITIONS = new Set<SchemaDiagramMemberBadgePosition>([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

export interface SchemaDiagramWorkspaceOptions {
  memberBadgePosition?: SchemaDiagramMemberBadgePosition;
}

export interface SchemaDiagramBlockData {
  typeIds?: string[];
  relationshipTypes?: string[];
  theme?: SchemaDiagramTheme;
  direction?: SchemaDiagramDirection;
}

export interface SchemaDiagramConfig {
  typeIds: string[] | null;
  relationshipTypes: string[] | null;
  theme: SchemaDiagramTheme;
  direction: SchemaDiagramDirection;
  memberBadgePosition: SchemaDiagramMemberBadgePosition;
}

const THEMES = new Set<SchemaDiagramTheme>(["default", "dark", "forest", "neutral"]);
const DIRECTIONS = new Set<SchemaDiagramDirection>(["TB", "LR"]);

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return items.length > 0 ? items : null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function normalizeMemberBadgePosition(
  value: unknown,
): SchemaDiagramMemberBadgePosition {
  if (typeof value === "string" && MEMBER_BADGE_POSITIONS.has(value as SchemaDiagramMemberBadgePosition)) {
    return value as SchemaDiagramMemberBadgePosition;
  }
  return DEFAULT_SCHEMA_DIAGRAM_MEMBER_BADGE_POSITION;
}

export function resolveSchemaDiagramWorkspaceOptions(
  workspace?: SchemaDiagramWorkspaceOptions,
): Pick<SchemaDiagramConfig, "memberBadgePosition"> {
  return {
    memberBadgePosition: normalizeMemberBadgePosition(workspace?.memberBadgePosition),
  };
}

export function parseSchemaDiagramConfig(
  data: unknown,
  workspace?: SchemaDiagramWorkspaceOptions,
): SchemaDiagramConfig {
  const root = record(data) ?? {};
  const themeRaw = typeof root.theme === "string" ? root.theme : "default";
  const directionRaw = typeof root.direction === "string" ? root.direction : "TB";
  const workspaceOptions = resolveSchemaDiagramWorkspaceOptions(workspace);

  return {
    typeIds: stringArray(root.typeIds),
    relationshipTypes: stringArray(root.relationshipTypes),
    theme: THEMES.has(themeRaw as SchemaDiagramTheme) ? (themeRaw as SchemaDiagramTheme) : "default",
    direction: DIRECTIONS.has(directionRaw as SchemaDiagramDirection)
      ? (directionRaw as SchemaDiagramDirection)
      : "TB",
    memberBadgePosition: workspaceOptions.memberBadgePosition,
  };
}

export function defaultSchemaDiagramBlockData(): SchemaDiagramBlockData {
  return {};
}
