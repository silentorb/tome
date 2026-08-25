import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openContentGraph } from "tome-db/content";
import {
  createExtensionGraphQueryServices,
  createExtensionSchemaQueryServices,
  createExtensionExecuteImpServices,
  createExtensionCorpusQueryServices,
  loadSchemaFromContent,
  loadWorkspaceFromContent,
  schemaDiagramPageBlockServices,
  spatialGraphNodeDimensionScale,
} from "tome-db";
import type { ResolvedConfig } from "./config";
import type { SiteData, SiteNode } from "./lib/site-types";
import { buildExtraTabPayloadsAndRoutes, buildSiteNode } from "./lib/static-export";
import { buildNodeUrlIndex, createNodeUrlResolver } from "./lib/node-urls";
import { ExtensionHtmlRuntime } from "./extensions/loader";
import { createPageBlockHtmlContext, renderNodeBodyHtml } from "./lib/page-block-html";
import { resolveStaticSiteFooter } from "./lib/static-site-footer";

export type { SiteData, SiteNode } from "./lib/site-types";

export async function loadNodesFromGraph(config: ResolvedConfig): Promise<SiteData> {
  const writeCtx = openContentGraph(config.contentDir, config.dbPath);
  const graphStore = writeCtx.graphStore;
  const schema = loadSchemaFromContent(config.contentDir);
  const workspace = loadWorkspaceFromContent(config.contentDir);
  const nodes: SiteNode[] = [];

  for (const id of writeCtx.store.listNodeIds()) {
    const node = buildSiteNode(graphStore, id, config.contentDir, schema);
    if (node) nodes.push(node);
  }

  const { tabItemsPayloads, tabRoutes } = buildExtraTabPayloadsAndRoutes(
    graphStore,
    nodes,
    config.contentDir,
  );

  const { pathById, aliasToId } = buildNodeUrlIndex(nodes);
  const urls = createNodeUrlResolver({ pathById, aliasToId, base: config.base });

  const titleById: Record<string, string> = {};
  for (const node of nodes) {
    titleById[node.id] = node.title;
  }

  const htmlRuntime = new ExtensionHtmlRuntime(config.contentDir);
  await htmlRuntime.ensureLoaded();
  const graphQuery = createExtensionGraphQueryServices(writeCtx.graphStore, config.contentDir);
  const schemaQuery = createExtensionSchemaQueryServices(graphStore, config.contentDir);
  const executeImp = createExtensionExecuteImpServices(writeCtx.graphStore);
  const corpusQuery = createExtensionCorpusQueryServices(writeCtx.store);
  const spatialGraphScale = spatialGraphNodeDimensionScale(workspace);
  const spatialGraphServices = spatialGraphScale
    ? { nodeDimensionScale: spatialGraphScale }
    : undefined;
  const schemaDiagram = schemaDiagramPageBlockServices(workspace);
  if (htmlRuntime.components.length > 0) {
    for (const node of nodes) {
      const ctx = createPageBlockHtmlContext(
        htmlRuntime.host,
        htmlRuntime.components,
        node.id,
        config.contentDir,
        graphQuery,
        spatialGraphServices,
        schemaQuery,
        schemaDiagram,
        executeImp,
        corpusQuery,
      );
      node.bodyHtml = await renderNodeBodyHtml(
        node.body,
        node.title,
        urls,
        (id) => titleById[id] ?? "Untitled",
        ctx,
      );
    }
  }

  writeCtx.cache.close();
  graphStore.close();

  const staticSiteFooter = resolveStaticSiteFooter(workspace.branding);

  return {
    homeNodeId: workspace.staticSite.homeNodeId,
    staticSiteHeader: workspace.branding?.staticSiteHeader ?? "Tome",
    ...(staticSiteFooter !== undefined ? { staticSiteFooter } : {}),
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
