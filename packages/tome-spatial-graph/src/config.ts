export const DEFAULT_PARENT_HEADER_HEIGHT = 28;

export const DEFAULT_NODE_DIMENSION_SCALE = { x: 1, y: 1 } as const;

export const MIN_NODE_DIMENSION_SCALE = 0.5;
export const MAX_NODE_DIMENSION_SCALE = 4;

export interface SpatialGraphNodeDimensionScale {
  x: number;
  y: number;
}

export interface SpatialGraphWorkspaceConfig {
  nodeDimensionScale?: Partial<SpatialGraphNodeDimensionScale>;
}

export interface SpatialGraphBlockData {
  relationships?: {
    parentTypes?: string[];
    childTypes?: string[];
    neighborTypes?: string[];
  };
  layout?: Record<string, unknown>;
  svg?: {
    full?: boolean;
    scale?: number;
    bg?: string;
  };
}

export interface SpatialGraphConfig {
  relationships: {
    parentTypes: string[];
    childTypes: string[];
    neighborTypes: string[];
  };
  layout: Record<string, unknown>;
  parentHeaderHeight: number;
  nodeDimensionScale: SpatialGraphNodeDimensionScale;
  svg: {
    full: boolean;
    scale: number;
    bg?: string;
  };
}

const DEFAULT_PARENT_TYPES = ["parents"];
const DEFAULT_CHILD_TYPES = ["children"];
const DEFAULT_NEIGHBOR_TYPES = ["neighbor"];

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function clampAxis(value: number): number {
  return Math.min(MAX_NODE_DIMENSION_SCALE, Math.max(MIN_NODE_DIMENSION_SCALE, value));
}

export function normalizeNodeDimensionScale(
  partial?: Partial<SpatialGraphNodeDimensionScale>,
): SpatialGraphNodeDimensionScale {
  const x =
    typeof partial?.x === "number" && Number.isFinite(partial.x) && partial.x > 0
      ? clampAxis(partial.x)
      : DEFAULT_NODE_DIMENSION_SCALE.x;
  const y =
    typeof partial?.y === "number" && Number.isFinite(partial.y) && partial.y > 0
      ? clampAxis(partial.y)
      : DEFAULT_NODE_DIMENSION_SCALE.y;
  return { x, y };
}

export function parseSpatialGraphConfig(data: unknown): SpatialGraphConfig {
  const root = record(data) ?? {};
  const relationships = record(root.relationships) ?? {};
  const svg = record(root.svg) ?? {};
  const layoutRaw = record(root.layout) ?? {};
  const parentHeaderHeight =
    typeof layoutRaw.parentHeaderHeight === "number" && layoutRaw.parentHeaderHeight > 0
      ? layoutRaw.parentHeaderHeight
      : DEFAULT_PARENT_HEADER_HEIGHT;
  const { parentHeaderHeight: _ignored, ...layout } = layoutRaw;

  return {
    relationships: {
      parentTypes: stringArray(relationships.parentTypes) ?? DEFAULT_PARENT_TYPES,
      childTypes: stringArray(relationships.childTypes) ?? DEFAULT_CHILD_TYPES,
      neighborTypes: stringArray(relationships.neighborTypes) ?? DEFAULT_NEIGHBOR_TYPES,
    },
    layout,
    parentHeaderHeight,
    nodeDimensionScale: normalizeNodeDimensionScale(),
    svg: {
      full: typeof svg.full === "boolean" ? svg.full : true,
      scale: typeof svg.scale === "number" && svg.scale > 0 ? svg.scale : 1,
      bg: typeof svg.bg === "string" ? svg.bg : undefined,
    },
  };
}

export function resolveSpatialGraphConfig(
  data: unknown,
  workspace?: SpatialGraphWorkspaceConfig,
): SpatialGraphConfig {
  const config = parseSpatialGraphConfig(data);
  if (workspace?.nodeDimensionScale) {
    config.nodeDimensionScale = normalizeNodeDimensionScale(workspace.nodeDimensionScale);
  }
  return config;
}

export function defaultSpatialGraphBlockData(): SpatialGraphBlockData {
  return {
    relationships: {
      parentTypes: DEFAULT_PARENT_TYPES,
      childTypes: DEFAULT_CHILD_TYPES,
      neighborTypes: DEFAULT_NEIGHBOR_TYPES,
    },
  };
}
