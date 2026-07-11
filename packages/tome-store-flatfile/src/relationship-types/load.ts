import { existsSync, readFileSync, statSync } from "node:fs";
import { relationshipTypesFilePath } from "../content/paths";
import {
  emptyRelationshipTypesFile,
  parseRelationshipTypesFile,
  type RelationshipTypesFile,
} from "../content/relationship-types-file";

let cachedTypes: { mtimeMs: number; file: RelationshipTypesFile } | null = null;

export function invalidateRelationshipTypesCache(): void {
  cachedTypes = null;
}

export function loadRelationshipTypesFromContent(contentDir: string): RelationshipTypesFile {
  const path = relationshipTypesFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (cachedTypes && cachedTypes.mtimeMs === mtimeMs) {
    return cachedTypes.file;
  }

  let file: RelationshipTypesFile;
  try {
    file = parseRelationshipTypesFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyRelationshipTypesFile();
    } else {
      throw err;
    }
  }

  cachedTypes = { mtimeMs, file };
  return file;
}
