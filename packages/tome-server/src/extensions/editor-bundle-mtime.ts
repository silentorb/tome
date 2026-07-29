import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/** Newest mtime under `root`. Used to invalidate editor.js bundles when sources change. */
export function maxSourceMtimeMs(root: string): number {
  if (!existsSync(root)) return 0;
  const st = statSync(root);
  if (st.isFile()) return st.mtimeMs;

  let max = st.mtimeMs;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      const path = join(dir, name);
      const entry = statSync(path);
      if (entry.mtimeMs > max) max = entry.mtimeMs;
      if (entry.isDirectory()) stack.push(path);
    }
  }
  return max;
}

/** Directory to watch for Bun.build inputs of an editor entrypoint (`…/src/editor.tsx` → `…/src`). */
export function editorBundleWatchRoot(entrypoint: string): string {
  return dirname(entrypoint);
}
