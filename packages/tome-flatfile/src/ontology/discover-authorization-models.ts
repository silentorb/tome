import { ContentStore } from "../content/store";
import { loadOntologyFileFromContent } from "./load";
import {
  loadAssociationsRegistry,
  setMembersFromEntries,
} from "./discover-shared";

/** True when ontology.json declares types.authorizationModel. */
export function contentHasAuthorizationModelType(contentDir: string): boolean {
  return Boolean(loadOntologyFileFromContent(contentDir).types.authorizationModel);
}

/**
 * Discover Authorization Model instance ids for a corpus:
 * set members of types.authorizationModel (the type-table hub).
 * Returns [] when the type key is omitted (optional).
 */
export function discoverAuthorizationModelInstanceIds(contentDir: string): string[] {
  const ontology = loadOntologyFileFromContent(contentDir);
  const typeId = ontology.types.authorizationModel;
  if (!typeId) return [];

  const store = new ContentStore(contentDir);
  const entries = store.readRelationshipsFile().relationships;
  const registry = loadAssociationsRegistry(contentDir);
  return setMembersFromEntries(typeId, entries, registry);
}
