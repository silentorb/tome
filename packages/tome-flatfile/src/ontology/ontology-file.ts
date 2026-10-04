import { isNodeId } from "../node-id";
import type { OntologyFile, OntologyTypeKey } from "tome-graph-interfaces";
import { ONTOLOGY_FILE_VERSION } from "tome-graph-interfaces";

export type { OntologyFile, OntologyTypeKey };
export { ONTOLOGY_FILE_VERSION };

const TYPE_KEYS: OntologyTypeKey[] = ["ontology", "predicate"];

export function emptyOntologyFile(): OntologyFile {
  return { version: ONTOLOGY_FILE_VERSION, types: {} };
}

function parseTypeNodeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !isNodeId(value)) {
    throw new Error(`${path}: must be a node id (ULID)`);
  }
  return value;
}

export function parseOntologyFile(raw: string): OntologyFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ontology.json: invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ontology.json: must be an object");
  }
  const obj = parsed as Record<string, unknown>;
  const version = obj.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("ontology.json: version must be a positive integer");
  }

  const types: OntologyFile["types"] = {};
  if (obj.types !== undefined) {
    if (!obj.types || typeof obj.types !== "object" || Array.isArray(obj.types)) {
      throw new Error("ontology.json: types must be an object");
    }
    const typesObj = obj.types as Record<string, unknown>;
    for (const key of TYPE_KEYS) {
      if (typesObj[key] !== undefined) {
        types[key] = parseTypeNodeId(typesObj[key], `ontology.json: types.${key}`);
      }
    }
  }

  return { version, types };
}

export function serializeOntologyFile(file: OntologyFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function ontologyTypesConfigured(file: OntologyFile): boolean {
  return Boolean(file.types.ontology || file.types.predicate);
}
