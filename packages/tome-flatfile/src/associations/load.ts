import { existsSync, readFileSync, statSync } from "node:fs";
import { associationsFilePath } from "../content/paths";
import {
  emptyAssociationsFile,
  parseAssociationsFile,
  type AssociationsFile,
} from "../content/associations-file";

let cachedTypes: { mtimeMs: number; file: AssociationsFile } | null = null;

export function invalidateAssociationsCache(): void {
  cachedTypes = null;
}

export function loadAssociationsFromContent(contentDir: string): AssociationsFile {
  const path = associationsFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (cachedTypes && cachedTypes.mtimeMs === mtimeMs) {
    return cachedTypes.file;
  }

  let file: AssociationsFile;
  try {
    file = parseAssociationsFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyAssociationsFile();
    } else {
      throw err;
    }
  }

  cachedTypes = { mtimeMs, file };
  return file;
}
