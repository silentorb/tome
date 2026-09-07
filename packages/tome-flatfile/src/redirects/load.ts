import { existsSync, readFileSync, statSync } from "node:fs";
import { redirectsFilePath } from "../content/paths";
import {
  emptyRedirectsFile,
  parseRedirectsFile,
  type RedirectsFile,
} from "../content/redirects-file";

let cachedRedirects: { contentDir: string; mtimeMs: number; file: RedirectsFile } | null = null;

export function invalidateRedirectsCache(): void {
  cachedRedirects = null;
}

export function loadRedirectsFromContent(contentDir: string): RedirectsFile {
  const path = redirectsFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (
    cachedRedirects &&
    cachedRedirects.contentDir === contentDir &&
    cachedRedirects.mtimeMs === mtimeMs
  ) {
    return cachedRedirects.file;
  }

  let file: RedirectsFile;
  try {
    file = parseRedirectsFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyRedirectsFile();
    } else {
      throw err;
    }
  }

  cachedRedirects = { contentDir, mtimeMs, file };
  return file;
}
