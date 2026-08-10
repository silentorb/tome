import { existsSync, readFileSync, statSync } from "node:fs";
import { sequencingFilePath } from "../content/paths";
import {
  emptySequencingFile,
  parseSequencingFile,
  type SequencingFile,
} from "./sequencing-file";

const cache = new Map<string, { mtimeMs: number; file: SequencingFile }>();

export function invalidateSequencingCache(contentDir?: string): void {
  if (contentDir) cache.delete(contentDir);
  else cache.clear();
}

export function loadSequencingFromContent(contentDir: string): SequencingFile {
  const path = sequencingFilePath(contentDir);
  if (!existsSync(path)) return emptySequencingFile();
  const mtimeMs = statSync(path).mtimeMs;
  const hit = cache.get(contentDir);
  if (hit && hit.mtimeMs === mtimeMs) return hit.file;
  const file = parseSequencingFile(readFileSync(path, "utf-8"));
  cache.set(contentDir, { mtimeMs, file });
  return file;
}
