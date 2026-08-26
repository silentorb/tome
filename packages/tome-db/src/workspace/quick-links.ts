import type { TomeWriteContext } from "../content/write-context";
import { contentDirForGraphStore } from "../content/write-context";
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

const FALLBACK_ICON = "M";

export function isWorkspaceQuickLink(workspace: WorkspaceFile, nodeId: string): boolean {
  return workspace.quickLinks.some((link) => link.nodeId === nodeId);
}

function defaultQuickLinkIcon(workspace: WorkspaceFile): string {
  return workspace.branding?.defaultDocumentIcon?.trim() || FALLBACK_ICON;
}

function nodeTitle(ctx: TomeWriteContext, nodeId: string): string | null {
  const node = writeStoreGetNode(ctx.graphStore, nodeId);
  if (!node) return null;
  const title = node.properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Untitled";
}

function writeWorkspaceForNode(
  ctx: TomeWriteContext,
  nodeId: string,
  workspace: WorkspaceFile,
): void {
  const corpusId = writeStoreLocateNode(ctx.graphStore, nodeId);
  if (corpusId) {
    writeStoreWriteWorkspaceForCorpus(ctx.graphStore, corpusId, workspace);
    return;
  }
  ctx.graphStore.writeWorkspace(workspace);
}

function workspaceForNode(ctx: TomeWriteContext, nodeId: string): WorkspaceFile {
  return loadWorkspaceFromContent(contentDirForGraphStore(ctx.graphStore, nodeId));
}

export function addWorkspaceQuickLink(
  ctx: TomeWriteContext,
  nodeId: string,
  options?: { label?: string; icon?: string },
): QuickLinkError | null {
  const normalizedId = nodeId;
  if (!writeStoreGetNode(ctx.graphStore, normalizedId)) return "not_found";

  const workspace = workspaceForNode(ctx, normalizedId);
  if (isWorkspaceQuickLink(workspace, normalizedId)) return "already_exists";

  const label = options?.label?.trim() || nodeTitle(ctx, normalizedId);
  if (!label) return "not_found";

  const icon =
    options?.icon !== undefined && options.icon !== ""
      ? options.icon
      : defaultQuickLinkIcon(workspace);

  const entry: WorkspaceQuickLink = {
    nodeId: normalizedId,
    label,
    icon,
  };

  const next: WorkspaceFile = {
    ...workspace,
    quickLinks: [...workspace.quickLinks, entry],
  };

  writeWorkspaceForNode(ctx, normalizedId, next);
  invalidateWorkspaceCache();
  return null;
}

export function removeWorkspaceQuickLink(
  ctx: TomeWriteContext,
  nodeId: string,
): QuickLinkError | null {
  const normalizedId = nodeId;
  const workspace = workspaceForNode(ctx, normalizedId);
  if (!isWorkspaceQuickLink(workspace, normalizedId)) return "not_a_quick_link";

  const next: WorkspaceFile = {
    ...workspace,
    quickLinks: workspace.quickLinks.filter((link) => link.nodeId !== normalizedId),
  };

  writeWorkspaceForNode(ctx, normalizedId, next);
  invalidateWorkspaceCache();
  return null;
}

export function reorderWorkspaceQuickLinks(
  ctx: TomeWriteContext,
  nodeIds: readonly string[],
): QuickLinkError | null {
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

  writeWorkspaceForNode(ctx, nodeIds[0]!, next);
  invalidateWorkspaceCache();
  return null;
}
