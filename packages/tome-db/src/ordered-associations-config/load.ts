import { existsSync, readFileSync, statSync } from "node:fs";
import { orderedAssociationsFilePath } from "../content/paths";
import {
  emptyOrderedAssociationsFile,
  parseOrderedAssociationsFile,
  type OrderedAssociationsFile,
} from "./ordered-associations-file";

let cachedOrderedAssociations: {
  contentDir: string;
  mtimeMs: number;
  file: OrderedAssociationsFile;
} | null = null;

export function invalidateOrderedAssociationsCache(): void {
  cachedOrderedAssociations = null;
}

export function loadOrderedAssociationsFromContent(contentDir: string): OrderedAssociationsFile {
  const path = orderedAssociationsFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (
    cachedOrderedAssociations &&
    cachedOrderedAssociations.contentDir === contentDir &&
    cachedOrderedAssociations.mtimeMs === mtimeMs
  ) {
    return cachedOrderedAssociations.file;
  }

  let file: OrderedAssociationsFile;
  try {
    file = parseOrderedAssociationsFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyOrderedAssociationsFile();
    } else {
      throw err;
    }
  }

  cachedOrderedAssociations = { contentDir, mtimeMs, file };
  return file;
}
