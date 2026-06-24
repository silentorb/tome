import type { Properties } from "tome-db";
import { resolveMarkdownHrefTarget } from "tome-db/markdown-links";

export const URL_ALIAS_PROPERTY = "url_alias";

const NODE_ID_PATTERN = /^[a-f0-9]{32}$/i;
const RESERVED_PATH_ROOTS = new Set(["_astro"]);

export interface NodeUrlIndex {
  pathById: Record<string, string>;
  aliasToId: Record<string, string>;
}

export interface NodeUrlIndexInput {
  id: string;
  urlAlias?: string;
  urlPath?: string;
}

export interface NodeUrlResolver {
  pagePath(id: string): string;
  tabPath(id: string, tabId: string): string;
  resolveHref(href: string): string | null;
  pathById: Record<string, string>;
  aliasToId: Record<string, string>;
  base: string;
}

/** Normalize a raw `url_alias` frontmatter value to a canonical path segment string. */
export function normalizeUrlAlias(raw: unknown): string | null {
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

export function readUrlAlias(properties: Properties | null | undefined): string | null {
  if (!properties) return null;
  return normalizeUrlAlias(properties[URL_ALIAS_PROPERTY]);
}

/** Assign canonical `urlPath` per node and build lookup maps. Throws on conflicts. */
export function buildNodeUrlIndex(nodes: NodeUrlIndexInput[]): NodeUrlIndex {
  const pathById: Record<string, string> = {};
  const aliasToId: Record<string, string> = {};
  const pathOwner = new Map<string, string>();

  for (const node of nodes) {
    const nodeId = node.id.toLowerCase();
    const urlPath = node.urlAlias ?? nodeId;
    node.urlPath = urlPath;

    const existingOwner = pathOwner.get(urlPath);
    if (existingOwner && existingOwner !== nodeId) {
      throw new Error(
        `Duplicate static URL path "${urlPath}" for nodes ${nodeId} and ${existingOwner}`,
      );
    }
    pathOwner.set(urlPath, nodeId);
    pathById[nodeId] = urlPath;

    if (node.urlAlias) {
      if (aliasToId[node.urlAlias]) {
        throw new Error(
          `Duplicate url_alias "${node.urlAlias}" for nodes ${nodeId} and ${aliasToId[node.urlAlias]}`,
        );
      }
      aliasToId[node.urlAlias] = nodeId;
    }
  }

  return { pathById, aliasToId };
}

function stripBasePrefix(path: string, base: string): string {
  if (!base || base === "/") return path;
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  if (path === prefix) return "";
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length + 1);
  return path;
}

/** Normalize an href to a site-relative path without leading/trailing slashes. */
export function normalizeHrefAsSitePath(href: string, base = "/"): string | null {
  let path = href.trim().split("#")[0]!.split("?")[0]!;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;

  if (!path.startsWith("/")) path = `/${path}`;
  path = stripBasePrefix(path, base);
  path = path.replace(/^\/+|\/+$/g, "");
  if (!path) return null;

  path = path.replace(/\/tabs\/[^/]+$/, "");
  path = path.replace(/\/+$/, "");
  return path || null;
}

/** Resolve a markdown href to a node id, including alias paths. */
export function resolveStaticHrefTarget(
  href: string,
  base: string,
  aliasToId: Record<string, string>,
): string | null {
  const fromId = resolveMarkdownHrefTarget(href);
  if (fromId) return fromId;

  const path = normalizeHrefAsSitePath(href, base);
  if (!path) return null;

  if (NODE_ID_PATTERN.test(path)) return path.toLowerCase();
  return aliasToId[path] ?? null;
}

function joinBasePath(base: string, ...segments: string[]): string {
  const path = segments.filter(Boolean).join("/");
  if (!base || base === "/") return `/${path}/`;
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${prefix}/${path}/`;
}

export function createNodeUrlResolver(options: {
  pathById: Record<string, string>;
  aliasToId?: Record<string, string>;
  base?: string;
}): NodeUrlResolver {
  const base = options.base ?? "/";
  const pathById = options.pathById;
  const aliasToId = options.aliasToId ?? {};

  return {
    pathById,
    aliasToId,
    base,
    pagePath(id: string) {
      const nodeId = id.toLowerCase();
      const urlPath = pathById[nodeId] ?? nodeId;
      return joinBasePath(base, urlPath);
    },
    tabPath(id: string, tabId: string) {
      const nodeId = id.toLowerCase();
      const urlPath = pathById[nodeId] ?? nodeId;
      return joinBasePath(base, urlPath, "tabs", tabId);
    },
    resolveHref(href: string) {
      return resolveStaticHrefTarget(href, base, aliasToId);
    },
  };
}

/** Reverse-resolve a generated node page href to a node id (id or alias paths). */
export function nodeIdFromPageHref(
  href: string,
  pathById: Record<string, string>,
  base = "/",
): string | null {
  const hexMatch = /\/([a-f0-9]{32})\/(?:tabs\/[^/?#]+\/)?\/?(?:[#?].*)?$/i.exec(href);
  if (hexMatch?.[1]) return hexMatch[1].toLowerCase();

  const sitePath = normalizeHrefAsSitePath(href, base);
  if (!sitePath) return null;

  for (const [nodeId, urlPath] of Object.entries(pathById)) {
    if (urlPath === sitePath) return nodeId;
  }
  return null;
}
