import type { EditorApi } from "./api/client";
import { parseDynamicNodeLinkIds } from "./standalone-markdown";

/** Resolve titles for all dynamic links in a stored markdown body. */
export async function resolveDynamicLinkTitles(
  api: EditorApi,
  body: string,
): Promise<Map<string, string>> {
  const ids = parseDynamicNodeLinkIds(body);
  const titleForId = new Map<string, string>();
  if (ids.length === 0) return titleForId;

  await Promise.all(
    ids.map(async (id) => {
      try {
        const node = await api.getNode(id);
        titleForId.set(id, node?.title?.trim() || "Untitled");
      } catch {
        titleForId.set(id, "Untitled");
      }
    }),
  );
  return titleForId;
}

export function titleResolverFromMap(map: Map<string, string>): (nodeId: string) => string {
  return (nodeId: string) => map.get(nodeId.toLowerCase()) ?? map.get(nodeId) ?? "Untitled";
}
