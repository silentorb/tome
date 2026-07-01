import type { ExtensionGraphQueryServices } from "../../extension-services/graph-query";
import type { ExtensionSchemaQueryServices } from "../../extension-services/schema-query";
import type { PageBlockComponentRef } from "../types";

export type HtmlPageBlockRenderMode = "editor" | "static";

/** General-purpose HTML rendering context (not tied to static site generation). */
export interface HtmlPageBlockContext {
  component: PageBlockComponentRef;
  nodeId: string;
  contentDir: string;
  renderMode?: HtmlPageBlockRenderMode;
  services?: {
    graphQuery?: ExtensionGraphQueryServices;
    schemaQuery?: ExtensionSchemaQueryServices;
    nodePageHref?: (nodeId: string) => string;
    spatialGraph?: {
      nodeDimensionScale?: { x?: number; y?: number };
    };
    schemaDiagram?: {
      memberBadgePosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    };
  };
}

export interface HtmlPageBlockRenderer {
  implementationId: string;
  renderHtml(ctx: HtmlPageBlockContext, data: unknown): string | Promise<string>;
}

export interface HtmlPageBlockHost {
  registerPageBlockRenderer(renderer: HtmlPageBlockRenderer): void;
}

export type HtmlPageBlockModule = {
  register(host: HtmlPageBlockHost): void;
};

/** Fallback when no html renderer is registered for a block. */
export function unknownPageBlockHtml(componentId: string, label?: string): string {
  const title = label ?? componentId;
  return `<div class="tome-page-block-unknown" data-component-id="${escapeAttr(componentId)}"><p><em>${escapeHtml(title)}</em> (no HTML renderer)</p></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
