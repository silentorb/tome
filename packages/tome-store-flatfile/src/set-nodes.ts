import { loadTableSchemasFromContent } from "./table-schemas/load";
import { archiveNodeId } from "./workspace/resolve";
import { resolveContentPath } from "./content/paths";

/** Node ids that act as set hubs: type-table ids from table-schemas plus the archive hub. */
export function collectSetNodeIds(contentDir?: string): Set<string> {
  const dir = contentDir ?? resolveContentPath();
  const ids = new Set<string>();
  const schemas = loadTableSchemasFromContent(dir);
  for (const id of Object.keys(schemas.tables)) ids.add(id);
  try {
    ids.add(archiveNodeId(dir));
  } catch {
    /* workspace.json optional in tests */
  }
  return ids;
}
