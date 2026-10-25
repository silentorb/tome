import type { TomeWriteContext } from "../content/write-context";
import {
  contentDirForGraphStore,
  primaryCorpusIdFromGraphStore,
} from "../content/write-context";
import {
  invalidateWorkspaceCache,
  loadWorkspaceFromContent,
  type WorkspaceFile,
  type WorkspaceQuickLink,
} from "tome-flatfile";
import {
  writeStoreGetNode,
  writeStoreLocateNode,
  writeStoreWriteWorkspaceForCorpus,
} from "../graph-store/relationship-write";
import type { QuickLinkError } from "tome-graph-interfaces";

export type { QuickLinkError } from "tome-graph-interfaces";

export function isWorkspaceQuickLink(workspace: WorkspaceFile, nodeId: string): boolean {
  return workspace.quickLinks.some((link) => link.nodeId === nodeId);
}

async function nodeTitle(ctx: TomeWriteContext, nodeId: string): Promise<string | null> {
  const node = await writeStoreGetNode(ctx.graphStore, nodeId);
  if (!node) return null;
  const title = node.properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Untitled";
}

/** Persist corpus.json and write through the session SQLite corpora catalog. */
async function writeWorkspaceForNode(
  ctx: TomeWriteContext,
  nodeId: string,
  workspace: WorkspaceFile,
): Promise<void> {
  const located = writeStoreLocateNode(ctx.graphStore, nodeId);
  const corpusId = located ?? primaryCorpusIdFromGraphStore(ctx.graphStore);
  if (located) {
    await writeStoreWriteWorkspaceForCorpus(ctx.graphStore, corpusId, workspace);
  } else {
    await ctx.graphStore.writeWorkspace(workspace);
  }

  invalidateWorkspaceCache();
  const access =
    ctx.graphStore.listCorpora().find((c) => c.id === corpusId)?.access ?? "readwrite";
  await ctx.cache.upsertCorpus({ id: corpusId, access, workspace });
}

function workspaceForNode(ctx: TomeWriteContext, nodeId: string): WorkspaceFile {
  return loadWorkspaceFromContent(contentDirForGraphStore(ctx.graphStore, nodeId));
}

export async function addWorkspaceQuickLink(
  ctx: TomeWriteContext,
  nodeId: string,
  options?: { label?: string },
): Promise<QuickLinkError | null> {
  const normalizedId = nodeId;
  if (!await writeStoreGetNode(ctx.graphStore, normalizedId)) return "not_found";

  const workspace = workspaceForNode(ctx, normalizedId);
  if (isWorkspaceQuickLink(workspace, normalizedId)) return "already_exists";

  const label = options?.label?.trim() || await nodeTitle(ctx, normalizedId);
  if (!label) return "not_found";

  const entry: WorkspaceQuickLink = {
    nodeId: normalizedId,
    label,
  };

  const next: WorkspaceFile = {
    ...workspace,
    quickLinks: [...workspace.quickLinks, entry],
  };

  await writeWorkspaceForNode(ctx, normalizedId, next);
  return null;
}

export async function removeWorkspaceQuickLink(
  ctx: TomeWriteContext,
  nodeId: string,
): Promise<QuickLinkError | null> {
  const normalizedId = nodeId;
  const workspace = workspaceForNode(ctx, normalizedId);
  if (!isWorkspaceQuickLink(workspace, normalizedId)) return "not_a_quick_link";

  const next: WorkspaceFile = {
    ...workspace,
    quickLinks: workspace.quickLinks.filter((link) => link.nodeId !== normalizedId),
  };

  await writeWorkspaceForNode(ctx, normalizedId, next);
  return null;
}

export async function reorderWorkspaceQuickLinks(
  ctx: TomeWriteContext,
  nodeIds: readonly string[],
): Promise<QuickLinkError | null> {
  if (nodeIds.length === 0) return "invalid_order";
  // Reorder applies to the corpus of the first listed quick-link node.
  const workspace = workspaceForNode(ctx, nodeIds[0]!);
  const currentIds = workspace.quickLinks.map((link) => link.nodeId);
  const normalized = [...nodeIds];

  if (normalized.length !== currentIds.length) return "invalid_order";

  const currentSet = new Set(currentIds);
  if (normalized.some((id) => !currentSet.has(id))) return "invalid_order";
  if (new Set(normalized).size !== normalized.length) return "invalid_order";

  const byId = new Map(
    workspace.quickLinks.map((link) => [link.nodeId, link] as const),
  );
  const quickLinks = normalized.map((id) => byId.get(id)!);

  const next: WorkspaceFile = {
    ...workspace,
    quickLinks,
  };

  await writeWorkspaceForNode(ctx, nodeIds[0]!, next);
  return null;
}
