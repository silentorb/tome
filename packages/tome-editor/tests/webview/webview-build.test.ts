import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

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
    },
    { timeout: 30_000 },
  );
});
