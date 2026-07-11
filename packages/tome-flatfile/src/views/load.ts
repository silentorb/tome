import { existsSync, readFileSync, statSync } from "node:fs";
import { viewsFilePath } from "../content/paths";
import { emptyViewsFile, parseViewsFile, type ViewsFile } from "../content/views-file";

let cachedViews: { mtimeMs: number; file: ViewsFile } | null = null;

export function invalidateViewsCache(): void {
  cachedViews = null;
}

export function loadViewsFromContent(contentDir: string): ViewsFile {
  const path = viewsFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (cachedViews && cachedViews.mtimeMs === mtimeMs) {
    return cachedViews.file;
  }

  let file: ViewsFile;
  try {
    file = parseViewsFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyViewsFile();
    } else {
      throw err;
    }
  }

  cachedViews = { mtimeMs, file };
  return file;
}
