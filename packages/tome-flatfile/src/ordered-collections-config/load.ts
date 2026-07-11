import { existsSync, readFileSync, statSync } from "node:fs";
import { orderedCollectionsFilePath } from "../content/paths";
import {
  emptyOrderedCollectionsFile,
  parseOrderedCollectionsFile,
  type OrderedCollectionsFile,
} from "./ordered-collections-file";

let cachedOrderedCollections: {
  contentDir: string;
  mtimeMs: number;
  file: OrderedCollectionsFile;
} | null = null;

export function invalidateOrderedCollectionsCache(): void {
  cachedOrderedCollections = null;
}

export function loadOrderedCollectionsFromContent(contentDir: string): OrderedCollectionsFile {
  const path = orderedCollectionsFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (
    cachedOrderedCollections &&
    cachedOrderedCollections.contentDir === contentDir &&
    cachedOrderedCollections.mtimeMs === mtimeMs
  ) {
    return cachedOrderedCollections.file;
  }

  let file: OrderedCollectionsFile;
  try {
    file = parseOrderedCollectionsFile(readFileSync(path, "utf-8"), contentDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyOrderedCollectionsFile();
    } else {
      throw err;
    }
  }

  cachedOrderedCollections = { contentDir, mtimeMs, file };
  return file;
}
