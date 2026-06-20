import siteData from "../generated/site-data.json";
import type { SiteData, SiteNode, TabItemsPayload } from "./site-types";
import { tabPayloadKey } from "./static-export";

const data = siteData as SiteData;

export function loadSiteData(): SiteData {
  return data;
}

export function loadAllNodes(): SiteNode[] {
  return data.nodes;
}

export function loadNodeById(id: string): SiteNode | undefined {
  const normalized = id.toLowerCase();
  return data.nodes.find((node) => node.id.toLowerCase() === normalized);
}

export function loadNodeSummaries(): Pick<SiteNode, "id" | "title">[] {
  return data.nodes.map(({ id, title }) => ({ id, title }));
}

export function getSiteBase(): string {
  return data.base;
}

export function getHomeNodeId(): string {
  return data.homeNodeId;
}

export function getStaticSiteHeader(): string {
  return data.staticSiteHeader ?? "Tome";
}

export function loadTabRoutes() {
  return data.tabRoutes ?? [];
}

export function loadTabItemsPayload(nodeId: string, tabId: string): TabItemsPayload | undefined {
  return data.tabItemsPayloads?.[tabPayloadKey(nodeId, tabId)];
}

export function titleByIdRecord(): Record<string, string> {
  return Object.fromEntries(data.nodes.map((node) => [node.id.toLowerCase(), node.title]));
}
