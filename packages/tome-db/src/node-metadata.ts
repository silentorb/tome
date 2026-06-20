import type { GraphDatabase } from "./graph";
import { findMarkdownLinksToTarget } from "./markdown-links";
import { getNodeDetail } from "./queries";

export interface NodeBacklink {
  sourceId: string;
  title: string;
  linkText: string | null;
}

export interface NodePageMetadata {
  createdAt: string | null;
  modifiedAt: string | null;
  relationshipCount: number;
  backlinks: NodeBacklink[];
}

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

export function getNodePageMetadata(db: GraphDatabase, id: string): NodePageMetadata | null {
  const node = db.getNode(id);
  if (!node) return null;

  const backlinks: NodeBacklink[] = [];
  const seenSources = new Set<string>();

  for (const candidate of db.listNodesWithBodyLike(`%${id}%`)) {
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
    relationshipCount: db.countIncidentRelationships(id),
    backlinks,
  };
}
