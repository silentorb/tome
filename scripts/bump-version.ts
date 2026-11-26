#!/usr/bin/env bun
/** Delegates to silentorb-workbench. Run from workbench: bash scripts/bump-version.sh */
import { join } from "node:path";

// Sibling layout: ../silentorb-workbench, ../imp-ts next to this repo.
const devRoot = join(import.meta.dir, "../..");
const workbenchRoot = join(devRoot, "silentorb-workbench");
const script = join(workbenchRoot, "scripts/bump-version.ts");
const proc = Bun.spawn([process.execPath, script, ...process.argv.slice(2)], {
  cwd: workbenchRoot,
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, IMP_TS: join(devRoot, "imp-ts"), TOME: join(devRoot, "tome") },
});
process.exit(await proc.exited);
