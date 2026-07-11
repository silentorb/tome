import { existsSync, readFileSync, statSync } from "node:fs";
import { tableSchemasFilePath } from "../content/paths";
import {
  emptyTableSchemasFile,
  parseTableSchemasFile,
  type TableSchemasFile,
} from "../content/table-schemas-file";

let cachedTableSchemas: { mtimeMs: number; file: TableSchemasFile } | null = null;

export function invalidateTableSchemasCache(): void {
  cachedTableSchemas = null;
}

export function loadTableSchemasFromContent(contentDir: string): TableSchemasFile {
  const path = tableSchemasFilePath(contentDir);
  let mtimeMs = 0;
  if (existsSync(path)) {
    mtimeMs = statSync(path).mtimeMs;
  }

  if (cachedTableSchemas && cachedTableSchemas.mtimeMs === mtimeMs) {
    return cachedTableSchemas.file;
  }

  let file: TableSchemasFile;
  try {
    file = parseTableSchemasFile(readFileSync(path, "utf-8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      file = emptyTableSchemasFile();
    } else {
      throw err;
    }
  }

  cachedTableSchemas = { mtimeMs, file };
  return file;
}

export function hasTableSchemaEntry(contentDir: string, typeNodeId: string): boolean {
  const file = loadTableSchemasFromContent(contentDir);
  return typeNodeId in file.tables;
}
