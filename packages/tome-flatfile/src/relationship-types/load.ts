import { existsSync, readFileSync, statSync } from "node:fs";
import {
  compileAssociationConfig,
  emptyRelationshipRuntime,
  type RelationshipRuntime,
} from "tome-ontology";
import { relationshipTypesFilePath } from "../content/paths";
import {
  emptyRelationshipTypesFile,
  parseRelationshipTypesFile,
  type RelationshipTypesFile,
} from "../content/relationship-types-file";

let cachedTypes: {
  contentDir: string;
  mtimeMs: number;
  file: RelationshipTypesFile;
  runtime: RelationshipRuntime;
} | null = null;

export function invalidateRelationshipTypesCache(): void {
  cachedTypes = null;
}

function loadCached(contentDir: string): {
  file: RelationshipTypesFile;
  runtime: RelationshipRuntime;
} {
  const path = relationshipTypesFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (cachedTypes && cachedTypes.contentDir === contentDir && cachedTypes.mtimeMs === mtimeMs) {
    return { file: cachedTypes.file, runtime: cachedTypes.runtime };
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

  const runtime =
    Object.keys(file.relationshipTypes).length === 0
      ? emptyRelationshipRuntime()
      : compileAssociationConfig(file);

  cachedTypes = { contentDir, mtimeMs, file, runtime };
  return { file, runtime };
}

export function loadRelationshipTypesFromContent(contentDir: string): RelationshipTypesFile {
  return loadCached(contentDir).file;
}

/** AC → BR: associations.json compiled to the predicate/pattern runtime. */
export function loadRelationshipRuntimeFromContent(contentDir: string): RelationshipRuntime {
  return loadCached(contentDir).runtime;
}
