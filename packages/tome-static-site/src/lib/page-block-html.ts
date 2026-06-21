import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
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

export interface PageBlockHtmlContext {
  host: HtmlPageBlockHostImpl;
  componentsById: Map<string, ResolvedExtensionComponent>;
  nodeId: string;
  contentDir: string;
  graphQuery?: ExtensionGraphQueryServices;
}

export function createPageBlockHtmlContext(
  host: HtmlPageBlockHostImpl,
  components: ResolvedExtensionComponent[],
  nodeId: string,
  contentDir: string,
  graphQuery?: ExtensionGraphQueryServices,
): PageBlockHtmlContext {
  return {
    host,
    componentsById: new Map(components.map((component) => [component.id, component])),
    nodeId,
    contentDir,
    graphQuery,
  };
}

async function renderBlockHtml(
  ctx: PageBlockHtmlContext,
  componentId: string,
  data: unknown,
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
      services: ctx.graphQuery ? { graphQuery: ctx.graphQuery } : undefined,
    },
    data,
  );
}

export async function renderNodeBodyHtml(
  body: string,
  title: string,
  base: string,
  titleForId: (nodeId: string) => string,
  ctx: PageBlockHtmlContext,
  prepared?: PreparedNodeMarkdown,
): Promise<string> {
  const prep = prepared ?? prepareNodeMarkdown(body, title, base, titleForId);
  if (!prep.markdown.trim()) return "";

  const { markdown, blocks } = replacePageBlockFencesWithPlaceholders(prep.markdown);
  const { marked } = await import("marked");
  const proseHtml = (await marked.parse(markdown, { async: true })) as string;
  const blockFragments = await Promise.all(
    blocks.map((payload) => renderBlockHtml(ctx, payload.componentId, payload.data)),
  );
  const withBlocks = substitutePageBlockPlaceholders(proseHtml, blockFragments);
  return decorateDynamicLinkHtml(decorateCalloutHtml(withBlocks), prep.dynamicNodeIds);
}
