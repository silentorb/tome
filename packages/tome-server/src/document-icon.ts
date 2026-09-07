import { existsSync, readFileSync, realpathSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

export type DocumentIconReadResult =
  | { ok: true; body: Uint8Array; contentType: string }
  | { ok: false; error: "not_found" | "bad_path" | "bad_type" };

const CONTENT_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** Resolve and read a corpus branding document icon under `model/` (PNG/SVG only). */
export function readDocumentIconFile(
  contentDir: string,
  relativePath: string | undefined | null,
): DocumentIconReadResult {
  const trimmed = relativePath?.trim();
  if (!trimmed) return { ok: false, error: "not_found" };

  if (trimmed.includes("\0") || trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return { ok: false, error: "bad_path" };
  }

  const ext = extname(trimmed).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return { ok: false, error: "bad_type" };

  const contentRoot = resolve(contentDir);
  const modelRoot = resolve(contentRoot, "model");
  const candidate = resolve(contentRoot, trimmed);

  if (!isPathInside(candidate, modelRoot)) {
    return { ok: false, error: "bad_path" };
  }

  if (!existsSync(candidate)) return { ok: false, error: "not_found" };

  let realFile: string;
  let realModel: string;
  try {
    realFile = realpathSync(candidate);
    realModel = realpathSync(modelRoot);
  } catch {
    return { ok: false, error: "not_found" };
  }

  if (!isPathInside(realFile, realModel)) {
    return { ok: false, error: "bad_path" };
  }

  const body = new Uint8Array(readFileSync(realFile));
  return { ok: true, body, contentType };
}

function isPathInside(path: string, root: string): boolean {
  const normalizedRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  return path === root || path.startsWith(normalizedRoot);
}
