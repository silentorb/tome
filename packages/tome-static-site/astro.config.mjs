import { defineConfig } from "astro/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageRoot, "../..");

/** @param {string | undefined} value */
function resolveOutDir(value) {
  if (value) return resolve(value);
  return resolve(repoRoot, "dist/web");
}

/** @param {string | undefined} value */
function normalizeBase(value) {
  if (!value || value === "/") return "/";
  return value.endsWith("/") ? value : `${value}/`;
}

const outDir = resolveOutDir(process.env.TOME_WEB_OUT_DIR);
const base = normalizeBase(process.env.TOME_WEB_BASE);

export default defineConfig({
  srcDir: "src",
  outDir,
  base,
  build: {
    format: "directory",
  },
});
