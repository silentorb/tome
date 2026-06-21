import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve an extensions.json module path to an absolute file path for Bun.build. */
export function resolveExtensionModulePath(modulePath: string, contentPath: string): string {
  if (isAbsolute(modulePath) && existsSync(modulePath)) {
    return modulePath;
  }

  try {
    return fileURLToPath(import.meta.resolve(modulePath));
  } catch {
    const fromContent = isAbsolute(modulePath) ? modulePath : join(contentPath, modulePath);
    if (existsSync(fromContent)) return fromContent;
    throw new Error(`Cannot resolve extension module: ${modulePath}`);
  }
}
