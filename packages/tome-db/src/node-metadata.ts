import type { RelationshipReadStore } from "./graph-store/relationship-read";
import {
  readStoreCountIncidentRelationships,
  readStoreGetNode,
  readStoreListNodesWithBodyLike,
} from "./graph-store/relationship-read";
import { findMarkdownLinksToTarget } from "tome-flatfile/markdown-links";
import { getNodeDetail } from "./queries";
import type { NodeBacklink, NodePageMetadata } from "tome-graph-interfaces";

export type { NodeBacklink, NodePageMetadata } from "tome-graph-interfaces";


function isoTimestampFromProperties(
  properties: Record<string, unknown>,
  key: string,
): string | null {
  const value = properties[key];
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function getNodePageMetadata(db: RelationshipReadStore, id: string): NodePageMetadata | null {
  const node = readStoreGetNode(db, id);
  if (!node) return null;

  const backlinks: NodeBacklink[] = [];
  const seenSources = new Set<string>();

  for (const candidate of readStoreListNodesWithBodyLike(db, `%${id}%`)) {
    if (candidate.id === id) continue;
    const matches = findMarkdownLinksToTarget(candidate.body, id);
    if (matches.length === 0 || seenSources.has(candidate.id)) continue;

    seenSources.add(candidate.id);
    const source = getNodeDetail(db, candidate.id);
    const linkText = matches[0]?.linkText.trim() || null;
    backlinks.push({
      sourceId: candidate.id,
      title: source?.title ?? "Untitled",
      linkText,
    });
  }

  backlinks.sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    if (byTitle !== 0) return byTitle;
    return (a.linkText ?? "").localeCompare(b.linkText ?? "", undefined, { sensitivity: "base" });
  });

  return {
    createdAt: isoTimestampFromProperties(node.properties, "created_at"),
    modifiedAt: isoTimestampFromProperties(node.properties, "modified_at"),
    relationshipCount: readStoreCountIncidentRelationships(db, id),
    backlinks,
  };
}
