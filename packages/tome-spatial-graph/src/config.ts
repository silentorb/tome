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

export function parseSpatialGraphConfig(data: unknown): SpatialGraphConfig {
  const root = record(data) ?? {};
  const relationships = record(root.relationships) ?? {};
  const svg = record(root.svg) ?? {};

  return {
    relationships: {
      parentTypes: stringArray(relationships.parentTypes) ?? DEFAULT_PARENT_TYPES,
      childTypes: stringArray(relationships.childTypes) ?? DEFAULT_CHILD_TYPES,
      neighborTypes: stringArray(relationships.neighborTypes) ?? DEFAULT_NEIGHBOR_TYPES,
    },
    layout: record(root.layout) ?? {},
    svg: {
      full: typeof svg.full === "boolean" ? svg.full : true,
      scale: typeof svg.scale === "number" && svg.scale > 0 ? svg.scale : 1,
      bg: typeof svg.bg === "string" ? svg.bg : undefined,
    },
  };
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
