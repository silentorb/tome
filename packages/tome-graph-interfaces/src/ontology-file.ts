/** Supported keys in ontology.json `types` map (representative type-node ids). */
export type OntologyTypeKey = "ontology" | "predicate" | "memberScope";

export interface OntologyFile {
  version: number;
  /** Map of ontology role → type-table node id. */
  types: Partial<Record<OntologyTypeKey, string>>;
}

export const ONTOLOGY_FILE_VERSION = 1;
