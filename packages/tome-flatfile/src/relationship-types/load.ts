import { existsSync, readFileSync, statSync } from "node:fs";
import {
  compileAssociationConfig,
  emptyRelationshipRuntime,
  mergeRelationshipRuntimes,
  type RelationshipRuntime,
} from "tome-ontology";
import { ontologyFilePath, relationshipTypesFilePath } from "../content/paths";
import {
  emptyRelationshipTypesFile,
  parseRelationshipTypesFile,
  type RelationshipTypesFile,
} from "../content/relationship-types-file";
import { compileDiscoveredNodePredicates } from "../ontology/discover";
import { contentHasOntologyTypes, loadOntologyFileFromContent } from "../ontology/load";
import { invalidateMemberScopesCache } from "../ontology/member-scopes-load";

let cachedTypes: {
  contentDir: string;
  associationsMtimeMs: number;
  ontologyMtimeMs: number;
  file: RelationshipTypesFile;
  runtime: RelationshipRuntime;
} | null = null;

export function invalidateRelationshipTypesCache(): void {
  cachedTypes = null;
  invalidateMemberScopesCache();
}

function ontologyFileMtimeMs(contentDir: string): number {
  const path = ontologyFilePath(contentDir);
  if (existsSync(path)) return statSync(path).mtimeMs;
  return 0;
}

function loadCached(contentDir: string): {
  file: RelationshipTypesFile;
  runtime: RelationshipRuntime;
} {
  const path = relationshipTypesFilePath(contentDir);
  let associationsMtimeMs = 0;
  if (existsSync(path)) {
    associationsMtimeMs = statSync(path).mtimeMs;
  }
  const ontologyMtimeMs = ontologyFileMtimeMs(contentDir);

  if (
    cachedTypes &&
    cachedTypes.contentDir === contentDir &&
    cachedTypes.associationsMtimeMs === associationsMtimeMs &&
    cachedTypes.ontologyMtimeMs === ontologyMtimeMs
  ) {
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

  let runtime =
    Object.keys(file.relationshipTypes).length === 0
      ? emptyRelationshipRuntime()
      : compileAssociationConfig(file);

  if (contentHasOntologyTypes(contentDir)) {
    loadOntologyFileFromContent(contentDir);
    runtime = mergeRelationshipRuntimes(runtime, compileDiscoveredNodePredicates(contentDir));
  }

  cachedTypes = {
    contentDir,
    associationsMtimeMs,
    ontologyMtimeMs,
    file,
    runtime,
  };
  return { file, runtime };
}

export function loadRelationshipTypesFromContent(contentDir: string): RelationshipTypesFile {
  return loadCached(contentDir).file;
}

/** Associations.json (+ optional node ontology overlay) → RelationshipRuntime. */
export function loadRelationshipRuntimeFromContent(contentDir: string): RelationshipRuntime {
  return loadCached(contentDir).runtime;
}
