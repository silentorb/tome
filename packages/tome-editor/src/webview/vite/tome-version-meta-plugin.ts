import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** Read the Tome repo-root package.json version (container / release version). */
export function readTomeRootVersion(repoRoot: string): string {
  const manifestPath = join(repoRoot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(`Missing version in ${manifestPath}`);
  }
  return manifest.version;
}

export function renderTomeVersionMeta(version: string): string {
  return `<meta name="tome-version" content="${version}" />`;
}

/** Inject the container/root Tome version into the editor HTML head. */
export function tomeVersionMetaPlugin(repoRoot: string): Plugin {
  const version = readTomeRootVersion(repoRoot);
  const meta = renderTomeVersionMeta(version);
  return {
    name: "tome-version-meta",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (html.includes('name="tome-version"')) return html;
        return html.replace("</head>", `  ${meta}\n  </head>`);
      },
    },
  };
}
