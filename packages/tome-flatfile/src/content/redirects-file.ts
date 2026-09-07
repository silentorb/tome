import type { RedirectsFile } from "tome-graph-interfaces";
import { isNodeId } from "./paths";

export type { RedirectsFile } from "tome-graph-interfaces";

export const REDIRECTS_FILE_VERSION = 1;

const RESERVED_PATH_ROOTS = new Set(["_astro"]);

export function emptyRedirectsFile(): RedirectsFile {
  return { version: REDIRECTS_FILE_VERSION, redirects: {} };
}

/**
 * Normalize a redirect path key to canonical site-relative segments
 * (same rules as static-site `url_alias`).
 */
export function normalizeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let path = raw.trim();
  if (!path) return null;

  path = path.replace(/^\/+|\/+$/g, "");
  if (!path) return null;

  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  for (const segment of segments) {
    if (segment === ".." || segment === ".") return null;
  }

  const normalized = segments.map((segment) => segment.toLowerCase()).join("/");
  const firstSegment = segments[0]!.toLowerCase();
  if (RESERVED_PATH_ROOTS.has(firstSegment)) return null;

  return normalized;
}

export function parseRedirectsFile(raw: string): RedirectsFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("redirects.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("redirects.json: version is required");
  }
  if (obj.version !== REDIRECTS_FILE_VERSION) {
    throw new Error(
      `redirects.json: unsupported version ${obj.version} (expected ${REDIRECTS_FILE_VERSION})`,
    );
  }
  if (!obj.redirects || typeof obj.redirects !== "object" || Array.isArray(obj.redirects)) {
    throw new Error("redirects.json: redirects must be an object map");
  }

  const redirects: Record<string, string> = {};
  const seenNormalized = new Set<string>();

  for (const [rawPath, rawNodeId] of Object.entries(obj.redirects as Record<string, unknown>)) {
    const path = normalizeRedirectPath(rawPath);
    if (!path) {
      throw new Error(`redirects.json: invalid redirect path "${rawPath}"`);
    }
    if (seenNormalized.has(path)) {
      throw new Error(`redirects.json: duplicate redirect path "${path}"`);
    }
    if (typeof rawNodeId !== "string" || !isNodeId(rawNodeId)) {
      throw new Error(`redirects.json: redirects["${rawPath}"] must be a node id (ULID)`);
    }
    seenNormalized.add(path);
    redirects[path] = rawNodeId;
  }

  return { version: obj.version, redirects };
}

export function serializeRedirectsFile(file: RedirectsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
