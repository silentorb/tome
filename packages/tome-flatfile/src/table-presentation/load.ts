import { existsSync, readFileSync, statSync } from "node:fs";
import { tablePresentationFilePath } from "../content/paths";
import {
  emptyTablePresentationFile,
  parseTablePresentationFile,
  type TablePresentationFile,
} from "./table-presentation-file";

let cached: {
  contentDir: string;
  mtimeMs: number;
  file: TablePresentationFile;
} | null = null;

export function invalidateTablePresentationCache(): void {
  cached = null;
}

export function loadTablePresentationFromContent(contentDir: string): TablePresentationFile {
  const path = tablePresentationFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (cached && cached.contentDir === contentDir && cached.mtimeMs === mtimeMs) {
    return cached.file;
  }

  let file: TablePresentationFile;
  try {
    file = parseTablePresentationFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyTablePresentationFile();
    } else {
      throw err;
    }
  }

  cached = { contentDir, mtimeMs, file };
  return file;
}
