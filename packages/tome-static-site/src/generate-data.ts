import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openContentGraph } from "tome-db/content";
import { createExtensionGraphQueryServices, loadSchemaFromContent, loadWorkspaceFromContent } from "tome-db";
import type { ResolvedConfig } from "./config";
import type { SiteData, SiteNode } from "./lib/site-types";
import { buildExtraTabPayloadsAndRoutes, buildSiteNode } from "./lib/static-export";
import { buildNodeUrlIndex, createNodeUrlResolver } from "./lib/node-urls";
import { ExtensionHtmlRuntime } from "./extensions/loader";
import { createPageBlockHtmlContext, renderNodeBodyHtml } from "./lib/page-block-html";

export type { SiteData, SiteNode } from "./lib/site-types";

export async function loadNodesFromGraph(config: ResolvedConfig): Promise<SiteData> {
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

  const { pathById, aliasToId } = buildNodeUrlIndex(nodes);
  const urls = createNodeUrlResolver({ pathById, aliasToId, base: config.base });

  const titleById: Record<string, string> = {};
  for (const node of nodes) {
    titleById[node.id.toLowerCase()] = node.title;
  }

  const htmlRuntime = new ExtensionHtmlRuntime(config.contentDir);
  await htmlRuntime.ensureLoaded();
  const graphQuery = createExtensionGraphQueryServices(db);
  if (htmlRuntime.components.length > 0) {
    for (const node of nodes) {
      const ctx = createPageBlockHtmlContext(
        htmlRuntime.host,
        htmlRuntime.components,
        node.id,
        config.contentDir,
        graphQuery,
      );
      node.bodyHtml = await renderNodeBodyHtml(
        node.body,
        node.title,
        urls,
        (id) => titleById[id.toLowerCase()] ?? "Untitled",
        ctx,
      );
    }
  }

  db.close();

  return {
    homeNodeId: workspace.staticSite.homeNodeId,
    staticSiteHeader: workspace.branding?.staticSiteHeader ?? "Tome",
    base: config.base,
    nodes,
    pathById,
    aliasToId,
    tabItemsPayloads,
    tabRoutes,
  };
}

export async function writeSiteData(config: ResolvedConfig, outFile: string): Promise<SiteData> {
  const data = await loadNodesFromGraph(config);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(data), "utf8");
  return data;
}

export function defaultSiteDataPath(packageRoot: string): string {
  return join(packageRoot, "src/generated/site-data.json");
}
