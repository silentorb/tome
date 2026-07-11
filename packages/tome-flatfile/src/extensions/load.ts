import { existsSync, readFileSync, statSync } from "node:fs";
import { extensionsFilePath } from "../content/paths";
import {
  emptyExtensionsFile,
  parseExtensionsFile,
  type ExtensionsFile,
} from "./extensions-file";

let cachedExtensions: {
  contentDir: string;
  mtimeMs: number;
  file: ExtensionsFile;
} | null = null;

export function invalidateExtensionsCache(): void {
  cachedExtensions = null;
}

export function loadExtensionsFromContent(contentDir: string): ExtensionsFile {
  const path = extensionsFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (
    cachedExtensions &&
    cachedExtensions.contentDir === contentDir &&
    cachedExtensions.mtimeMs === mtimeMs
  ) {
    return cachedExtensions.file;
  }

  let file: ExtensionsFile;
  try {
    file = parseExtensionsFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyExtensionsFile();
    } else {
      throw err;
    }
  }

  cachedExtensions = { contentDir, mtimeMs, file };
  return file;
}
