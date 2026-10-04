import { existsSync, readFileSync, statSync } from "node:fs";
import { ontologyFilePath } from "../content/paths";
import {
  emptyOntologyFile,
  ontologyTypesConfigured,
  parseOntologyFile,
  type OntologyFile,
} from "./ontology-file";

let cachedOntology: {
  contentDir: string;
  mtimeMs: number;
  file: OntologyFile;
} | null = null;

export function invalidateOntologyCache(): void {
  cachedOntology = null;
}

export function loadOntologyFileFromContent(contentDir: string): OntologyFile {
  const path = ontologyFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (
    cachedOntology &&
    cachedOntology.contentDir === contentDir &&
    cachedOntology.mtimeMs === mtimeMs
  ) {
    return cachedOntology.file;
  }

  let file: OntologyFile;
  try {
    file = parseOntologyFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyOntologyFile();
    } else {
      throw err;
    }
  }

  cachedOntology = { contentDir, mtimeMs, file };
  return file;
}

export function contentHasOntologyTypes(contentDir: string): boolean {
  return ontologyTypesConfigured(loadOntologyFileFromContent(contentDir));
}
