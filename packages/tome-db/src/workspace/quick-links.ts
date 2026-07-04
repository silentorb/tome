import type { TomeWriteContext } from "../content/write-context";
import { invalidateWorkspaceCache, loadWorkspaceFromContent } from "./load";
import type { WorkspaceFile, WorkspaceQuickLink } from "./workspace-file";

export type QuickLinkError = "not_found" | "already_exists" | "not_a_quick_link" | "invalid_order";

const FALLBACK_ICON = "M";

export function isWorkspaceQuickLink(workspace: WorkspaceFile, nodeId: string): boolean {
  return workspace.quickLinks.some((link) => link.nodeId === nodeId);
}

function defaultQuickLinkIcon(workspace: WorkspaceFile): string {
  return workspace.branding?.defaultDocumentIcon?.trim() || FALLBACK_ICON;
}

function nodeTitle(ctx: TomeWriteContext, nodeId: string): string | null {
  const node = ctx.store.readNode(nodeId);
  if (!node) return null;
  const title = node.properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Untitled";
}

export function addWorkspaceQuickLink(
  ctx: TomeWriteContext,
  nodeId: string,
  options?: { label?: string; icon?: string },
): QuickLinkError | null {
  const normalizedId = nodeId;
  if (!ctx.store.readNode(normalizedId)) return "not_found";

  const workspace = loadWorkspaceFromContent(ctx.store.contentDir);
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

  ctx.store.writeWorkspaceFile(next);
  invalidateWorkspaceCache();
  return null;
}

export function removeWorkspaceQuickLink(
  ctx: TomeWriteContext,
  nodeId: string,
): QuickLinkError | null {
  const normalizedId = nodeId;
  const workspace = loadWorkspaceFromContent(ctx.store.contentDir);
  if (!isWorkspaceQuickLink(workspace, normalizedId)) return "not_a_quick_link";

  const next: WorkspaceFile = {
    ...workspace,
    quickLinks: workspace.quickLinks.filter((link) => link.nodeId !== normalizedId),
  };

  ctx.store.writeWorkspaceFile(next);
  invalidateWorkspaceCache();
  return null;
}

export function reorderWorkspaceQuickLinks(
  ctx: TomeWriteContext,
  nodeIds: readonly string[],
): QuickLinkError | null {
  const workspace = loadWorkspaceFromContent(ctx.store.contentDir);
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

  ctx.store.writeWorkspaceFile(next);
  invalidateWorkspaceCache();
  return null;
}
