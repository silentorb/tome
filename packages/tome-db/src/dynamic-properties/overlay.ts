import { existsSync } from "node:fs";
import type { RelationshipReadStore } from "../graph-store/relationship-read";
import {
  loadDynamicColumnSetsFromContent,
  loadDynamicPropertiesFromContent,
} from "../content/sync";
import {
  dynamicPropertiesFilePath,
  readEnv,
  resolveContentPath,
  type DynamicColumnSetRecord,
  type DynamicPropertyRecord,
} from "tome-flatfile";

export type {
  DynamicColumnSetRecord,
  DynamicPropertyRecord,
  SeedDynamicColumnSetInput,
  SeedDynamicPropertyInput,
} from "tome-flatfile";

function contentDirForDynamicProperties(explicit?: string): string | null {
  const dir = explicit ?? readEnv("TOME_CONTENT_PATH") ?? resolveContentPath();
  if (existsSync(dynamicPropertiesFilePath(dir))) return dir;
  return null;
}

export function loadDynamicProperties(
  _db: RelationshipReadStore,
  owner: string,
  contentDir?: string,
): DynamicPropertyRecord[] {
  const fromContent = contentDirForDynamicProperties(contentDir);
  if (fromContent) {
    return loadDynamicPropertiesFromContent(fromContent, owner);
  }
  return [];
}

export function loadDynamicColumnSets(
  _db: RelationshipReadStore,
  owner: string,
  contentDir?: string,
): DynamicColumnSetRecord[] {
  const fromContent = contentDirForDynamicProperties(contentDir);
  if (fromContent) {
    return loadDynamicColumnSetsFromContent(fromContent, owner);
  }
  return [];
}
