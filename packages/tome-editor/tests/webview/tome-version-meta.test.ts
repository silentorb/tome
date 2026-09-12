import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readTomeRootVersion,
  renderTomeVersionMeta,
} from "../../src/webview/vite/tome-version-meta-plugin";

describe("tome version meta", () => {
  test("reads the Tome repo-root package.json version", () => {
    const repoRoot = resolve(import.meta.dirname, "../../../..");
    const expected = (JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
      version: string;
    }).version;
    expect(readTomeRootVersion(repoRoot)).toBe(expected);
  });

  test("renders tome-version meta tag", () => {
    expect(renderTomeVersionMeta("0.2.1")).toBe(
      '<meta name="tome-version" content="0.2.1" />',
    );
  });
});
