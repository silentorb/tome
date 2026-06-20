import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyBuildEnv, printHelp, readConfig } from "./config";
import { defaultSiteDataPath, writeSiteData } from "./generate-data";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const result = readConfig(process.argv.slice(2));
if (result.help) {
  printHelp();
  process.exit(0);
}

const { config } = result;
applyBuildEnv(config);

const siteDataPath = defaultSiteDataPath(packageRoot);
const data = writeSiteData(config, siteDataPath);

console.log(`Building static site → ${config.outDir}`);
console.log(`  content: ${config.contentDir}`);
console.log(`  base:    ${config.base}`);
console.log(`  nodes:   ${data.nodes.length}`);
console.log(`  tab pages: ${data.tabRoutes.length}`);

const astro = spawnSync("bun", ["astro", "build"], {
  cwd: packageRoot,
  env: process.env,
  stdio: "inherit",
});

process.exit(astro.status ?? 1);
