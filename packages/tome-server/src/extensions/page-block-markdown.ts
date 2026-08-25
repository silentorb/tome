import type { ExtensionCorpusQueryServices } from "tome-interfaces/extension-services/corpus-query";
import type { ExtensionExecuteImpServices } from "tome-interfaces/extension-services/execute-imp";
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

export interface SchemaDiagramPageBlockServices {
  memberBadgePosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

async function renderBlockHtml(
  host: HtmlPageBlockHost,
  componentsById: Map<string, ResolvedExtensionComponent>,
  nodeId: string,
  contentPath: string,
  graphQuery: ExtensionGraphQueryServices | undefined,
  schemaQuery: ExtensionSchemaQueryServices | undefined,
  executeImp: ExtensionExecuteImpServices | undefined,
  corpusQuery: ExtensionCorpusQueryServices | undefined,
  spatialGraph: SpatialGraphPageBlockServices | undefined,
  schemaDiagram: SchemaDiagramPageBlockServices | undefined,
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
        executeImp,
        corpusQuery,
        nodePageHref: (targetNodeId) => `?node=${targetNodeId}`,
        ...(spatialGraph ? { spatialGraph } : {}),
        ...(schemaDiagram ? { schemaDiagram } : {}),
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
  executeImp?: ExtensionExecuteImpServices,
  corpusQuery?: ExtensionCorpusQueryServices,
  spatialGraph?: SpatialGraphPageBlockServices,
  schemaDiagram?: SchemaDiagramPageBlockServices,
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
      executeImp,
      corpusQuery,
      spatialGraph,
      schemaDiagram,
      payload,
    ),
  );
}

/** Render one page block to editor HTML (without the round-trip comment wrapper). */
export async function renderPageBlockHtmlForEditor(
  nodeId: string,
  contentPath: string,
  host: HtmlPageBlockHostImpl,
  components: ResolvedExtensionComponent[],
  payload: PageBlockPayload,
  graphQuery: ExtensionGraphQueryServices | undefined,
  schemaQuery: ExtensionSchemaQueryServices | undefined,
  executeImp?: ExtensionExecuteImpServices,
  corpusQuery?: ExtensionCorpusQueryServices,
  spatialGraph?: SpatialGraphPageBlockServices,
  schemaDiagram?: SchemaDiagramPageBlockServices,
): Promise<string> {
  const componentsById = new Map(components.map((component) => [component.id, component]));
  return renderBlockHtml(
    host,
    componentsById,
    nodeId,
    contentPath,
    graphQuery,
    schemaQuery,
    executeImp,
    corpusQuery,
    spatialGraph,
    schemaDiagram,
    payload,
  );
}
