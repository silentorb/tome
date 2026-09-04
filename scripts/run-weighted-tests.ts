#!/usr/bin/env bun
/**
 * Weighted test runner for the tome monorepo.
 *
 * 1. Runs root typecheck (blocking).
 * 2. Runs each package suite with Bun JUnit output (continues after failures).
 * 3. Classifies cases as essential vs nonessential ([nonessential] name/classname prefix).
 * 4. Gates: any essential failure → exit 1; else nonessential pass rate must meet threshold.
 *
 * Env:
 *   TOME_TEST_NONESSENTIAL_PASS_RATE — default 0.90
 *   TOME_TEST_JUNIT_DIR — directory for per-package JUnit XML (default: OS temp)
 *
 * Nonessential tests always run; they are not a skip/config toggle.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateGate,
  formatGateSummary,
  parseJunitXml,
  type TestCaseResult,
} from "../packages/tome-test-support/src/index";

const TOME_ROOT = join(import.meta.dir, "..");

type PackageSpec = {
  name: string;
  /** Args after `bun test`, relative to the package directory. */
  bunTestArgs: string[];
};

/** Same order as historical root `test` script, plus tome-test-support early. */
const PACKAGES: PackageSpec[] = [
  { name: "tome-test-support", bunTestArgs: ["tests"] },
  { name: "tome-theme-midnight", bunTestArgs: ["tests"] },
  { name: "tome-interfaces", bunTestArgs: ["tests"] },
  { name: "tome-graph-interfaces", bunTestArgs: ["tests"] },
  { name: "tome-service-interfaces", bunTestArgs: ["tests"] },
  { name: "tome-db", bunTestArgs: ["tests"] },
  { name: "tome-http", bunTestArgs: ["tests"] },
  { name: "tome-server", bunTestArgs: ["tests"] },
  {
    name: "tome-editor",
    bunTestArgs: ["--preload", "./tests/test-setup.ts", "tests"],
  },
  { name: "tome-static-site", bunTestArgs: ["tests"] },
  { name: "tome-spatial-graph", bunTestArgs: ["tests"] },
  { name: "tome-schema-diagram", bunTestArgs: ["tests"] },
  { name: "tome-imp-sql", bunTestArgs: ["tests"] },
  {
    name: "tome-query",
    bunTestArgs: ["--preload", "./tests/test-setup.ts", "tests"],
  },
  { name: "tome-sequencing-interfaces", bunTestArgs: ["tests"] },
  { name: "tome-sequencing-resolution", bunTestArgs: ["tests"] },
  {
    name: "tome-sequencing",
    bunTestArgs: ["--preload", "./tests/test-setup.ts", "tests"],
  },
  {
    name: "tome-functional-tests",
    bunTestArgs: ["--preload", "./tests/test-setup.ts", "tests"],
  },
];

function readMinPassRate(): number {
  const raw = process.env.TOME_TEST_NONESSENTIAL_PASS_RATE ?? "0.90";
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(
      `TOME_TEST_NONESSENTIAL_PASS_RATE must be a number in [0, 1]; got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

async function runTypecheck(): Promise<void> {
  console.log("==> typecheck");
  const proc = Bun.spawn(["bun", "run", "typecheck"], {
    cwd: TOME_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`typecheck failed with exit code ${code}`);
    process.exit(code || 1);
  }
}

async function runPackageTests(
  pkg: PackageSpec,
  junitPath: string,
): Promise<{ exitCode: number }> {
  const cwd = join(TOME_ROOT, "packages", pkg.name);
  console.log(`==> ${pkg.name}`);
  const proc = Bun.spawn(
    [
      "bun",
      "test",
      "--reporter=junit",
      `--reporter-outfile=${junitPath}`,
      ...pkg.bunTestArgs,
    ],
    {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await proc.exited;
  return { exitCode };
}

function loadCases(junitPath: string, packageName: string): TestCaseResult[] {
  let xml: string;
  try {
    xml = readFileSync(junitPath, "utf8");
  } catch {
    console.warn(
      `  warning: no JUnit output for ${packageName} at ${junitPath}; treating as empty suite`,
    );
    return [];
  }
  return parseJunitXml(xml, packageName);
}

async function main(): Promise<void> {
  const minRate = readMinPassRate();
  const junitDir =
    process.env.TOME_TEST_JUNIT_DIR ??
    mkdtempSync(join(tmpdir(), "tome-junit-"));
  mkdirSync(junitDir, { recursive: true });
  const ownedTemp = !process.env.TOME_TEST_JUNIT_DIR;

  try {
    await runTypecheck();

    const allCases: TestCaseResult[] = [];
    for (const pkg of PACKAGES) {
      const junitPath = join(junitDir, `${pkg.name}.xml`);
      await runPackageTests(pkg, junitPath);
      allCases.push(...loadCases(junitPath, pkg.name));
    }

    const evaluation = evaluateGate(allCases, minRate);
    console.log("");
    console.log(formatGateSummary(evaluation));

    if (!evaluation.decision.ok) {
      process.exit(1);
    }
  } finally {
    if (ownedTemp) {
      try {
        rmSync(junitDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

await main();
