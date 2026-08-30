#!/usr/bin/env bun
/**
 * Tome repo bump script — scans tome packages and imp-ts sibling packages for ranges/cascade.
 *
 * Usage:
 *   bun scripts/bump-version.ts <package-name> <minor|patch> [--install]
 *   bun scripts/bump-version.ts --baseline [--install]
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const packagesDir = join(repoRoot, "packages");
const extraPackageRoots = [join(repoRoot, "../imp-ts/packages")];

type Manifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type PackageEntry = {
  dir: string;
  manifestPath: string;
  manifest: Manifest;
};

function loadPackages(root: string): PackageEntry[] {
  const entries: PackageEntry[] = [];
  for (const dirName of readdirSync(root, { withFileTypes: true })) {
    if (!dirName.isDirectory()) continue;
    const manifestPath = join(root, dirName.name, "package.json");
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
      if (manifest.name) entries.push({ dir: join(root, dirName.name), manifestPath, manifest });
    } catch {
      /* skip */
    }
  }
  return entries;
}

function allPackages(): PackageEntry[] {
  return [packagesDir, ...extraPackageRoots].flatMap(loadPackages);
}

function internalPackageNames(): Set<string> {
  return new Set(allPackages().map((p) => p.manifest.name));
}

function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Unsupported version format: ${version}`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function formatVersion(v: { major: number; minor: number; patch: number }): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpVersion(current: string, level: "minor" | "patch"): string {
  const v = parseVersion(current);
  if (level === "minor") {
    return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
  }
  return formatVersion({ ...v, patch: v.patch + 1 });
}

function workspaceRange(version: string): string {
  const v = parseVersion(version);
  return `workspace:^${v.major}.${v.minor}.0`;
}

function depSections(manifest: Manifest): Array<Record<string, string>> {
  const sections: Array<Record<string, string>> = [];
  if (manifest.dependencies) sections.push(manifest.dependencies);
  if (manifest.devDependencies) sections.push(manifest.devDependencies);
  return sections;
}

function updateRangesForDependency(pkg: PackageEntry, depName: string, depVersion: string): boolean {
  let changed = false;
  const range = workspaceRange(depVersion);
  for (const section of depSections(pkg.manifest)) {
    if (!(depName in section)) continue;
    if (section[depName] !== range) {
      section[depName] = range;
      changed = true;
    }
  }
  return changed;
}

function savePackage(entry: PackageEntry): void {
  writeFileSync(entry.manifestPath, `${JSON.stringify(entry.manifest, null, 2)}\n`);
}

function findDependents(targetName: string): PackageEntry[] {
  const internal = internalPackageNames();
  return allPackages().filter((pkg) => {
    for (const section of depSections(pkg.manifest)) {
      for (const [dep, spec] of Object.entries(section)) {
        if (dep === targetName && internal.has(dep) && spec.startsWith("workspace:")) return true;
      }
    }
    return false;
  });
}

function bumpPackage(name: string, level: "minor" | "patch", visited = new Set<string>()): string[] {
  if (visited.has(name)) return [];
  visited.add(name);

  const pkg = allPackages().find((p) => p.manifest.name === name);
  if (!pkg) throw new Error(`Package not found: ${name}`);

  const oldVersion = pkg.manifest.version;
  const newVersion = bumpVersion(oldVersion, level);
  pkg.manifest.version = newVersion;
  savePackage(pkg);

  const touched = [name];
  console.log(`  ${name}: ${oldVersion} → ${newVersion} (${level})`);

  for (const dependent of allPackages()) {
    if (updateRangesForDependency(dependent, name, newVersion)) {
      savePackage(dependent);
    }
  }

  if (level === "minor") {
    for (const dependent of findDependents(name)) {
      if (dependent.manifest.name === name) continue;
      touched.push(...bumpPackage(dependent.manifest.name, "minor", visited));
    }
  }

  return touched;
}

function baselineInternalRanges(): void {
  const packages = allPackages();
  const versions = new Map(packages.map((p) => [p.manifest.name, p.manifest.version]));
  const internal = internalPackageNames();
  let changed = 0;

  for (const pkg of packages) {
    let pkgChanged = false;
    for (const section of depSections(pkg.manifest)) {
      for (const [dep, spec] of Object.entries(section)) {
        if (!internal.has(dep) || !spec.startsWith("workspace:")) continue;
        const depVersion = versions.get(dep);
        if (!depVersion) continue;
        const next = workspaceRange(depVersion);
        if (section[dep] !== next) {
          section[dep] = next;
          pkgChanged = true;
        }
      }
    }
    if (pkgChanged) {
      savePackage(pkg);
      changed++;
      console.log(`  ${pkg.manifest.name}: updated workspace ranges`);
    }
  }

  console.log(`Baselined ${changed} package(s).`);
}

function lockfileHint(): void {
  console.log("\nLockfiles to refresh:");
  console.log("  - .mnt/tome    → bun install");
  const touchedImp = allPackages().some((p) => p.manifestPath.includes("/imp-ts/"));
  if (touchedImp) console.log("  - .mnt/imp-ts  → bun install");
}

async function maybeInstall(): Promise<void> {
  console.log(`\nRunning bun install in ${repoRoot}...`);
  const proc = Bun.spawn(["bun", "install"], { cwd: repoRoot, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) process.exit(code);
}

const args = process.argv.slice(2);
const install = args.includes("--install");
const positional = args.filter((a) => a !== "--install");

if (positional[0] === "--baseline") {
  baselineInternalRanges();
  lockfileHint();
  if (install) await maybeInstall();
  process.exit(0);
}

const [packageName, level] = positional;
if (!packageName || (level !== "minor" && level !== "patch")) {
  console.error("Usage: bun scripts/bump-version.ts <package> <minor|patch> [--install]");
  console.error("       bun scripts/bump-version.ts --baseline [--install]");
  process.exit(1);
}

console.log(`Bumping ${packageName} (${level})...`);
const touched = [...new Set(bumpPackage(packageName, level))];
console.log(`\nTouched: ${touched.join(", ")}`);
lockfileHint();
if (install) await maybeInstall();
