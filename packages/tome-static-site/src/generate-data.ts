import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openContentGraph } from "tome-db/content";
import { loadSchemaFromContent, loadWorkspaceFromContent } from "tome-db";
import type { ResolvedConfig } from "./config";
import type { SiteData, SiteNode } from "./lib/site-types";
import { buildExtraTabPayloadsAndRoutes, buildSiteNode } from "./lib/static-export";

export type { SiteData, SiteNode } from "./lib/site-types";

export function loadNodesFromGraph(config: ResolvedConfig): SiteData {
  const { store, db } = openContentGraph(config.contentDir, config.dbPath);
  const schema = loadSchemaFromContent(config.contentDir);
  const workspace = loadWorkspaceFromContent(config.contentDir);
  const nodes: SiteNode[] = [];

  for (const id of store.listNodeIds()) {
    const node = buildSiteNode(db, id, config.contentDir, schema);
    if (node) nodes.push(node);
  }

  const { tabItemsPayloads, tabRoutes } = buildExtraTabPayloadsAndRoutes(
    db,
    nodes,
    config.contentDir,
  );

  db.close();

  return {
    homeNodeId: workspace.staticSite.homeNodeId,
    staticSiteHeader: workspace.branding?.staticSiteHeader ?? "Tome",
    base: config.base,
    nodes,
    tabItemsPayloads,
    tabRoutes,
  };
}

export function writeSiteData(config: ResolvedConfig, outFile: string): SiteData {
  const data = loadNodesFromGraph(config);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(data), "utf8");
  return data;
}

export function defaultSiteDataPath(packageRoot: string): string {
  return join(packageRoot, "src/generated/site-data.json");
}
