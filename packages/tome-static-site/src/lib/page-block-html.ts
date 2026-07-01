import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionSchemaQueryServices } from "tome-interfaces/extension-services/schema-query";
import {
  replacePageBlockFencesWithPlaceholders,
  substitutePageBlockPlaceholders,
} from "tome-interfaces/page-block";
import {
  unknownPageBlockHtml,
  type HtmlPageBlockHost,
} from "tome-interfaces/page-block/html";
import type { ResolvedExtensionComponent } from "tome-db";
import { HtmlPageBlockHostImpl } from "../extensions/html-host";
import { decorateCalloutHtml } from "./callout-html";
import { decorateDynamicLinkHtml } from "./dynamic-link-html";
import { prepareNodeMarkdown, type PreparedNodeMarkdown } from "./markdown";
import type { NodeUrlResolver } from "./node-urls";

export interface SpatialGraphPageBlockServices {
  nodeDimensionScale?: { x?: number; y?: number };
}

export interface PageBlockHtmlContext {
  host: HtmlPageBlockHostImpl;
  componentsById: Map<string, ResolvedExtensionComponent>;
  nodeId: string;
  contentDir: string;
  graphQuery?: ExtensionGraphQueryServices;
  schemaQuery?: ExtensionSchemaQueryServices;
  spatialGraph?: SpatialGraphPageBlockServices;
}

export function createPageBlockHtmlContext(
  host: HtmlPageBlockHostImpl,
  components: ResolvedExtensionComponent[],
  nodeId: string,
  contentDir: string,
  graphQuery?: ExtensionGraphQueryServices,
  spatialGraph?: SpatialGraphPageBlockServices,
  schemaQuery?: ExtensionSchemaQueryServices,
): PageBlockHtmlContext {
  return {
    host,
    componentsById: new Map(components.map((component) => [component.id, component])),
    nodeId,
    contentDir,
    graphQuery,
    spatialGraph,
    schemaQuery,
  };
}

async function renderBlockHtml(
  ctx: PageBlockHtmlContext,
  componentId: string,
  data: unknown,
  urls: NodeUrlResolver,
): Promise<string> {
  const component = ctx.componentsById.get(componentId);
  if (!component) {
    return unknownPageBlockHtml(componentId);
  }
  const renderer = ctx.host.get(component.implementationId);
  if (!renderer) {
    return unknownPageBlockHtml(componentId, component.label);
  }
  return await renderer.renderHtml(
    {
      component,
      nodeId: ctx.nodeId,
      contentDir: ctx.contentDir,
      renderMode: "static",
      services: {
        graphQuery: ctx.graphQuery,
        schemaQuery: ctx.schemaQuery,
        nodePageHref: (targetNodeId) => urls.pagePath(targetNodeId),
        ...(ctx.spatialGraph ? { spatialGraph: ctx.spatialGraph } : {}),
      },
    },
    data,
  );
}

export async function renderNodeBodyHtml(
  body: string,
  title: string,
  urls: NodeUrlResolver,
  titleForId: (nodeId: string) => string,
  ctx: PageBlockHtmlContext,
  prepared?: PreparedNodeMarkdown,
): Promise<string> {
  const prep = prepared ?? prepareNodeMarkdown(body, title, urls, titleForId);
  if (!prep.markdown.trim()) return "";

  const { markdown, blocks } = replacePageBlockFencesWithPlaceholders(prep.markdown);
  const { marked } = await import("marked");
  const proseHtml = (await marked.parse(markdown, { async: true })) as string;
  const blockFragments = await Promise.all(
    blocks.map((payload) => renderBlockHtml(ctx, payload.componentId, payload.data, urls)),
  );
  const withBlocks = substitutePageBlockPlaceholders(proseHtml, blockFragments);
  return decorateDynamicLinkHtml(decorateCalloutHtml(withBlocks), prep.dynamicNodeIds, urls);
}
