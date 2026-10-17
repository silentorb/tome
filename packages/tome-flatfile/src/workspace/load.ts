import { existsSync, readFileSync, statSync } from "node:fs";
import { resolveContentPath, resolveCorpusMetadataPath } from "../content/paths";
import { parseWorkspaceFile, type WorkspaceFile } from "./workspace-file";

let cachedWorkspace: { contentDir: string; mtimeMs: number; file: WorkspaceFile; path: string } | null =
  null;

export function invalidateWorkspaceCache(): void {
  cachedWorkspace = null;
}

export function loadWorkspaceFromContent(contentDir: string): WorkspaceFile {
  const path = resolveCorpusMetadataPath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (
    cachedWorkspace &&
    cachedWorkspace.contentDir === contentDir &&
    cachedWorkspace.path === path &&
    cachedWorkspace.mtimeMs === mtimeMs
  ) {
    return cachedWorkspace.file;
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`corpus metadata not found at ${path}`);
    }
    throw err;
  }

  const file = parseWorkspaceFile(raw);
  cachedWorkspace = { contentDir, mtimeMs, file, path };
  return file;
}

/** Load workspace config from the default `content/` directory. */
export function loadWorkspace(): WorkspaceFile {
  return loadWorkspaceFromContent(resolveContentPath());
}
