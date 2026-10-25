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
  mergeRelationshipTypesFiles,
  parseRelationshipTypesFile,
  type RelationshipTypesFile,
} from "../content/relationship-types-file";
import { compileDiscoveredNodePredicates } from "../ontology/discover";
import { discoverActiveRelationshipTypes } from "../ontology/discover-relationship-types";
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

  let associationsFile: RelationshipTypesFile;
  try {
    associationsFile = parseRelationshipTypesFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      associationsFile = emptyRelationshipTypesFile();
    } else {
      throw err;
    }
  }

  let file = associationsFile;
  if (contentHasOntologyTypes(contentDir)) {
    loadOntologyFileFromContent(contentDir);
    const nodeTypes = discoverActiveRelationshipTypes(contentDir);
    file = mergeRelationshipTypesFiles(associationsFile, nodeTypes);
  }

  let runtime =
    Object.keys(file.relationshipTypes).length === 0
      ? emptyRelationshipRuntime()
      : compileAssociationConfig(file);

  if (contentHasOntologyTypes(contentDir)) {
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

/**
 * Associations.json merged with active node-authored relationship types
 * (`types.relationshipType`). Node entries win on the same id.
 */
export function loadRelationshipTypesFromContent(contentDir: string): RelationshipTypesFile {
  return loadCached(contentDir).file;
}

/**
 * Merged relationship-types registry compiled to RelationshipRuntime, plus
 * optional node-predicate overlay (selection filters).
 */
export function loadRelationshipRuntimeFromContent(contentDir: string): RelationshipRuntime {
  return loadCached(contentDir).runtime;
}
