import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(path));
    else out.push(path);
  }
  return out;
}

describe("webview build", () => {
  test(
    "vite production build succeeds without bundling server-only tome-db code",
    () => {
      const packageDir = resolve(import.meta.dirname, "../..");
      const result = spawnSync("bun", ["run", "build:webview"], {
        cwd: packageDir,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production" },
      });

      if (result.status !== 0) {
        throw new Error(
          [`webview build failed (exit ${result.status})`, result.stdout, result.stderr]
            .filter(Boolean)
            .join("\n"),
        );
      }

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("bun:sqlite");

      const distDir = join(packageDir, "dist-webview");
      const rootVersion = (
        JSON.parse(readFileSync(resolve(packageDir, "../../package.json"), "utf8")) as {
          version: string;
        }
      ).version;
      const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");
      expect(indexHtml).toContain(`<meta name="tome-version" content="${rootVersion}" />`);

      const bundled = listFilesRecursive(distDir)
        .filter((path) => path.endsWith(".js") || path.endsWith(".mjs"))
        .map((path) => readFileSync(path, "utf8"))
        .join("\n");
      expect(bundled).not.toContain("bun:sqlite");
      expect(bundled).not.toContain("tome-sqlite");
    },
    { timeout: 30_000 },
  );
});

