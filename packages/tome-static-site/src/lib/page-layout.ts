import type { SiteNode } from "./site-types";
import type { StaticSiteLayout } from "./static-site-layout";

export function resolveNodeLayout(node: SiteNode): StaticSiteLayout {
  return node.layout ?? "default";
}

export function isBareLayout(layout: StaticSiteLayout): boolean {
  return layout === "bare";
}
