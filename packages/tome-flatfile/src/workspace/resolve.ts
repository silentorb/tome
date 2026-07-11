import { resolveContentPath } from "../content/paths";
import { loadWorkspaceFromContent } from "./load";
import type { WorkspaceFile } from "./workspace-file";

export function resolveWorkspace(contentDir?: string): WorkspaceFile {
  return loadWorkspaceFromContent(contentDir ?? resolveContentPath());
}

export function archiveNodeId(contentDir?: string): string {
  return resolveWorkspace(contentDir).archiveNodeId;
}

export function protectedNodeIds(contentDir?: string): ReadonlySet<string> {
  return new Set(resolveWorkspace(contentDir).protectedNodeIds);
}

export function legacyArchivePathPrefix(contentDir?: string): string | undefined {
  return resolveWorkspace(contentDir).legacy?.archivePathPrefix;
}

export function legacyExportPathPrefix(contentDir?: string): string {
  return resolveWorkspace(contentDir).legacy?.exportPathPrefix ?? "";
}
