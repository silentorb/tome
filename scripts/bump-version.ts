#!/usr/bin/env bun
/** Delegates to silentorb-workbench. Run from workbench: bash scripts/bump-version.sh */
import { join } from "node:path";

const workbenchRoot = join(import.meta.dir, "../../..");
const script = join(workbenchRoot, "scripts/bump-version.ts");
const proc = Bun.spawn([process.execPath, script, ...process.argv.slice(2)], {
  cwd: workbenchRoot,
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, IMP_TS: join(workbenchRoot, ".mnt/imp-ts"), TOME: join(workbenchRoot, ".mnt/tome") },
});
process.exit(await proc.exited);
