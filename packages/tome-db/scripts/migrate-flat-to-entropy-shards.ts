#!/usr/bin/env bun
/**
 * Move flat `content/data/{id}.md` files into entropy shards
 * `content/data/{id[10:12]}/{id}.md`.
 *
 *   bun run scripts/migrate-flat-to-entropy-shards.ts <contentDir>
 *   TOME_CONTENT_PATH=... bun run scripts/migrate-flat-to-entropy-shards.ts
 */
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  contentDataDir,
  nodeFilePath,
  NODE_FILE_PATTERN,
} from "../src/content/paths";

const target = process.argv[2] ?? process.env.TOME_CONTENT_PATH;
if (!target) {
  console.error("Usage: bun run scripts/migrate-flat-to-entropy-shards.ts <contentDir>");
  process.exit(1);
}

const contentDir = resolve(target);
const dataDir = contentDataDir(contentDir);
if (!existsSync(dataDir)) {
  console.error(`No data dir at ${dataDir}`);
  process.exit(1);
}

let moved = 0;
let skipped = 0;

for (const name of readdirSync(dataDir)) {
  if (!NODE_FILE_PATTERN.test(name)) continue;
  const id = name.slice(0, -3);
  const from = resolve(dataDir, name);
  const to = nodeFilePath(contentDir, id);
  if (from === to) {
    skipped += 1;
    continue;
  }
  if (existsSync(to)) {
    console.error(`Target already exists: ${to}`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
  moved += 1;
}

console.log(`Moved ${moved} node file(s) into entropy shards under ${dataDir}`);
if (skipped > 0) console.log(`Skipped ${skipped} already-sharded file(s)`);
