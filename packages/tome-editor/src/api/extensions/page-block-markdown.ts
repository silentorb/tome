import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionSchemaQueryServices } from "tome-interfaces/extension-services/schema-query";
import {
  expandPageBlockFencesForEditor,
  type PageBlockPayload,
} from "tome-interfaces/page-block";
import {
  unknownPageBlockHtml,
  type HtmlPageBlockHost,
} from "tome-interfaces/page-block/html";
import type { ResolvedExtensionComponent } from "tome-db";
import type { HtmlPageBlockHostImpl } from "./html-host";

export interface SpatialGraphPageBlockServices {
  nodeDimensionScale?: { x?: number; y?: number };
}

async function renderBlockHtml(
  host: HtmlPageBlockHost,
  componentsById: Map<string, ResolvedExtensionComponent>,
  nodeId: string,
  contentPath: string,
  graphQuery: ExtensionGraphQueryServices | undefined,
  schemaQuery: ExtensionSchemaQueryServices | undefined,
  spatialGraph: SpatialGraphPageBlockServices | undefined,
  payload: PageBlockPayload,
): Promise<string> {
  const component = componentsById.get(payload.componentId);
  if (!component) {
    return unknownPageBlockHtml(payload.componentId);
  }
  const renderer = host.get(component.implementationId);
  if (!renderer) {
    return unknownPageBlockHtml(payload.componentId, component.label);
  }
  return await renderer.renderHtml(
    {
      component,
      nodeId,
      contentDir: contentPath,
      renderMode: "editor",
      services: {
        graphQuery,
        schemaQuery,
        nodePageHref: (targetNodeId) => `?node=${targetNodeId.toLowerCase()}`,
        ...(spatialGraph ? { spatialGraph } : {}),
      },
    },
    payload.data,
  );
}

export async function prepareEditorBodyWithPageBlocks(
  body: string,
  nodeId: string,
  contentPath: string,
  host: HtmlPageBlockHostImpl,
  components: ResolvedExtensionComponent[],
  graphQuery: ExtensionGraphQueryServices | undefined,
  schemaQuery: ExtensionSchemaQueryServices | undefined,
  spatialGraph?: SpatialGraphPageBlockServices,
): Promise<string> {
  const componentsById = new Map(components.map((component) => [component.id, component]));
  return expandPageBlockFencesForEditor(body, (payload) =>
    renderBlockHtml(
      host,
      componentsById,
      nodeId,
      contentPath,
      graphQuery,
      schemaQuery,
      spatialGraph,
      payload,
    ),
  );
}
