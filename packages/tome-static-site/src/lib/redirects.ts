import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createNodeUrlResolver } from "./node-urls";

export interface ResolvedRedirect {
  /** Normalized site-relative source path (no leading/trailing slashes). */
  path: string;
  nodeId: string;
  /** Site href including base, trailing slash (same as pagePath). */
  targetHref: string;
}

export function resolveRedirects(options: {
  redirects: Record<string, string>;
  pathById: Record<string, string>;
  tabRoutes?: { nodeId: string; tabId: string }[];
  base?: string;
}): ResolvedRedirect[] {
  const base = options.base ?? "/";
  const urls = createNodeUrlResolver({ pathById: options.pathById, base });
  const occupied = new Set<string>(Object.values(options.pathById));

  for (const route of options.tabRoutes ?? []) {
    const urlPath = options.pathById[route.nodeId] ?? route.nodeId;
    occupied.add(`${urlPath}/tabs/${route.tabId}`);
  }

  const resolved: ResolvedRedirect[] = [];

  for (const [path, nodeId] of Object.entries(options.redirects)) {
    if (!options.pathById[nodeId]) {
      throw new Error(`redirects.json: unknown node id "${nodeId}" for path "${path}"`);
    }
    if (occupied.has(path)) {
      throw new Error(
        `redirects.json: path "${path}" conflicts with an existing static site page`,
      );
    }
    occupied.add(path);
    resolved.push({
      path,
      nodeId,
      targetHref: urls.pagePath(nodeId),
    });
  }

  return resolved;
}

export function renderRedirectHtml(targetHref: string): string {
  const escaped = escapeHtmlAttr(targetHref);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Redirecting…</title>
  <meta http-equiv="refresh" content="0;url=${escaped}">
  <link rel="canonical" href="${escaped}">
  <script>location.replace(${JSON.stringify(targetHref)});</script>
</head>
<body>
  <p>Redirecting to <a href="${escaped}">${escapeHtmlText(targetHref)}</a>…</p>
</body>
</html>
`;
}

export function writeRedirectPages(outDir: string, redirects: ResolvedRedirect[]): void {
  for (const redirect of redirects) {
    const filePath = join(outDir, redirect.path, "index.html");
    if (existsSync(filePath)) {
      throw new Error(
        `redirects.json: refusing to overwrite existing output at "${redirect.path}/index.html"`,
      );
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, renderRedirectHtml(redirect.targetHref), "utf8");
  }
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
