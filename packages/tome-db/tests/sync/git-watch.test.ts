import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createGitWatchSyncEndpoint,
  findGitDir,
  findRepoRoot,
  gitPathsToSyncScopes,
  gitWatchCommitMetaKey,
  resolveGitHead,
} from "../../src/sync";

describe("git watch helpers", () => {
  test("findGitDir / findRepoRoot walk from content/", () => {
    const root = mkdtempSync(join(tmpdir(), "tome-git-watch-"));
    try {
      mkdirSync(join(root, ".git"));
      writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
      mkdirSync(join(root, "content", "data"), { recursive: true });
      expect(findRepoRoot(join(root, "content"))).toBe(root);
      expect(findGitDir(join(root, "content"))).toBe(join(root, ".git"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resolveGitHead follows symbolic refs", () => {
    const root = mkdtempSync(join(tmpdir(), "tome-git-head-"));
    try {
      const gitDir = join(root, ".git");
      mkdirSync(join(gitDir, "refs", "heads"), { recursive: true });
      const hash = "0123456789abcdef0123456789abcdef01234567";
      writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/main\n");
      writeFileSync(join(gitDir, "refs", "heads", "main"), `${hash}\n`);
      const resolved = resolveGitHead(gitDir);
      expect(resolved?.hash).toBe(hash);
      expect(resolved?.watchPaths).toContain(join(gitDir, "HEAD"));
      expect(resolved?.watchPaths).toContain(join(gitDir, "refs", "heads", "main"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("gitPathsToSyncScopes maps node files under content/", () => {
    const scopes = gitPathsToSyncScopes(
      [
        "content/data/nodes/KW/01KWN86X6MFZQAJ1V36T95928S.md",
        "content/model/schema.json",
      ],
      "/repo/content",
      "/repo",
    );
    expect(scopes.some((s) => s.mode === "partial")).toBe(true);
    expect(scopes.some((s) => s.mode === "content")).toBe(true);
  });

  test("createGitWatchSyncEndpoint records baseline and emits on hash change", async () => {
    const root = mkdtempSync(join(tmpdir(), "tome-git-ep-"));
    const meta = new Map<string, string>();
    try {
      mkdirSync(join(root, "content"), { recursive: true });

      await Bun.spawn(["git", "init"], { cwd: root, stdout: "ignore", stderr: "ignore" }).exited;
      writeFileSync(join(root, "content", "readme.txt"), "one\n");
      await Bun.spawn(["git", "add", "."], { cwd: root, stdout: "ignore", stderr: "ignore" }).exited;
      expect(
        await Bun.spawn(
          ["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "one"],
          { cwd: root, stdout: "ignore", stderr: "ignore" },
        ).exited,
      ).toBe(0);
      const rev1 = (
        await new Response(
          Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
        ).text()
      ).trim();
      writeFileSync(join(root, "content", "readme.txt"), "two\n");
      await Bun.spawn(["git", "add", "."], { cwd: root, stdout: "ignore", stderr: "ignore" }).exited;
      expect(
        await Bun.spawn(
          ["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "two"],
          { cwd: root, stdout: "ignore", stderr: "ignore" },
        ).exited,
      ).toBe(0);
      const rev2 = (
        await new Response(
          Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
        ).text()
      ).trim();
      expect(rev1).not.toBe(rev2);
      expect(rev1.length).toBeGreaterThan(0);

      const signals: unknown[] = [];
      const queryCache = {
        async setMeta(key: string, value: string) {
          meta.set(key, value);
        },
        async getMeta(key: string) {
          return meta.get(key) ?? null;
        },
      };

      const ep = createGitWatchSyncEndpoint({
        id: "git:c",
        storeId: "c",
        contentDir: join(root, "content"),
        source: {
          executeImp() {
            return { columns: ["id"], rows: [] };
          },
        },
        queryCache: queryCache as never,
        gitDir: join(root, ".git"),
        repoRoot: root,
      });

      expect(ep.subscribe).toBeDefined();
      const unsub = ep.subscribe!((s: { scope: unknown }) => {
        signals.push(s.scope);
      });

      await ep.recordBaselineHash();
      expect(meta.get(gitWatchCommitMetaKey("c"))).toBe(rev2);

      // Rewind meta to rev1 so check sees a change to tip rev2.
      meta.set(gitWatchCommitMetaKey("c"), rev1);
      await ep.checkForUpdates();
      expect(signals.length).toBeGreaterThan(0);
      expect(meta.get(gitWatchCommitMetaKey("c"))).toBe(rev2);

      unsub();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
