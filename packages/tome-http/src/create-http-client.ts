import type {
  GraphSnapshot,
  GraphLodSnapshot,
  EditorNodePageDetail,
  NodeBodyDocument,
  NodeSummary,
  DatabaseViewDetail,
  RelationTableSection,
  RelationshipTypeOption,
  ReorderDatabaseMembersParams,
  TableRowsQuery,
} from "tome-graph-interfaces";
import type { UserSettings, UserSettingsPatch } from "./user-settings";
import type { PublicExtensionsManifest } from "tome-graph-interfaces";
import type { SchemaFile } from "tome-graph-interfaces";
import type {
  CreateNodeResponse,
  TomeHttpClient,
  GetNodeOptions,
  GraphExplorerLodOptions,
  WorkspacePublic,
  TomeCorpusPublic,
} from "./client-types";
import { appendTableRowsQueryParams } from "./table-rows-query";

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3847";

function parseApiError(text: string, status: number): string {
  try {
    const payload = JSON.parse(text) as { error?: string };
    if (payload.error) return payload.error;
  } catch {
    /* not JSON */
  }
  return text.trim() || `Request failed: ${status}`;
}

export function createHttpClient(baseUrl: string): TomeHttpClient {
  const normalizedBase = baseUrl.replace(/\/$/, "");

  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${normalizedBase}${path}`, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiError(text, res.status));
    }
    return (await res.json()) as T;
  }

  async function saveNode(
    id: string,
    patch: {
      document?: NodeBodyDocument;
      title?: string;
    },
    options?: { keepalive?: boolean },
  ): Promise<void> {
    await fetchJson(`/api/nodes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      keepalive: options?.keepalive === true,
    });
  }

  return {
    async getWorkspace(corpusId?: string): Promise<WorkspacePublic> {
      const qs = corpusId ? `?corpusId=${encodeURIComponent(corpusId)}` : "";
      return fetchJson<WorkspacePublic>(`/api/workspace${qs}`);
    },
    async listCorpora(): Promise<TomeCorpusPublic[]> {
      const data = await fetchJson<{ corpora: TomeCorpusPublic[] }>("/api/corpora");
      return data.corpora;
    },
    async getHomeId(corpusId?: string): Promise<string> {
      const qs = corpusId ? `?corpusId=${encodeURIComponent(corpusId)}` : "";
      const data = await fetchJson<{ id: string }>(`/api/home${qs}`);
      return data.id;
    },
    async createNode(input: {
      title: string;
      body?: string;
      corpusId?: string;
    }): Promise<CreateNodeResponse> {
      const data = await fetchJson<{ node: CreateNodeResponse }>("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return data.node;
    },
    async createRelationRow(
      sourceId: string,
      input: { type: string; title: string; properties?: Record<string, string> },
    ): Promise<CreateNodeResponse> {
      const data = await fetchJson<{ node: CreateNodeResponse }>(
        `/api/nodes/${sourceId}/relation-rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return data.node;
    },
    async createDatabaseRow(
      databaseId: string,
      input: {
        title: string;
        view?: string;
        properties?: Record<string, string>;
        relations?: Array<{ type: string; targetId: string }>;
        orderScopeRelations?: Array<{ type: string; targetId: string }>;
      },
    ): Promise<CreateNodeResponse> {
      const data = await fetchJson<{ node: CreateNodeResponse }>(
        `/api/databases/${databaseId}/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return data.node;
    },
    async getNode(
      id: string,
      options?: GetNodeOptions | string,
    ): Promise<EditorNodePageDetail> {
      const normalized =
        typeof options === "string" ? { tab: options } : (options ?? {});
      const params = new URLSearchParams();
      const tab = normalized.tab ?? normalized.scope ?? normalized.view;
      if (tab) params.set("tab", tab);
      appendTableRowsQueryParams(params, normalized.rows);
      const query = params.toString();
      const data = await fetchJson<{ node: EditorNodePageDetail }>(
        `/api/nodes/${id}${query ? `?${query}` : ""}`,
      );
      return data.node;
    },
    async getDatabaseView(
      id: string,
      tabId?: string,
      rows?: TableRowsQuery,
    ): Promise<DatabaseViewDetail> {
      const params = new URLSearchParams();
      if (tabId) params.set("tab", tabId);
      appendTableRowsQueryParams(params, rows);
      const query = params.toString();
      const data = await fetchJson<{ databaseView: DatabaseViewDetail }>(
        `/api/databases/${id}${query ? `?${query}` : ""}`,
      );
      return data.databaseView;
    },
    async getRelationTable(
      nodeId: string,
      perspective: string,
      rows?: TableRowsQuery,
    ): Promise<RelationTableSection> {
      const params = new URLSearchParams();
      appendTableRowsQueryParams(params, rows);
      const query = params.toString();
      const data = await fetchJson<{ section: RelationTableSection }>(
        `/api/nodes/${nodeId}/relation-tables/${encodeURIComponent(perspective)}${query ? `?${query}` : ""}`,
      );
      return data.section;
    },
    async createRelationshipView(
      nodeId: string,
      association: string,
      input: {
        name: string;
        sorts?: import("tome-graph-interfaces").ViewSortSpec[];
        properties?: string[];
      },
    ) {
      const data = await fetchJson<{ view: import("tome-graph-interfaces").ViewDefinition }>(
        `/api/views/nodes/${nodeId}/associations/${encodeURIComponent(association)}/views`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return data.view;
    },
    async updateRelationshipView(
      nodeId: string,
      association: string,
      viewId: string,
      input: {
        name?: string;
        sorts?: import("tome-graph-interfaces").ViewSortSpec[];
        properties?: string[];
      },
    ) {
      const data = await fetchJson<{ view: import("tome-graph-interfaces").ViewDefinition }>(
        `/api/views/nodes/${nodeId}/associations/${encodeURIComponent(association)}/views/${encodeURIComponent(viewId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      return data.view;
    },
    async deleteRelationshipView(
      nodeId: string,
      association: string,
      viewId: string,
    ): Promise<void> {
      await fetchJson(
        `/api/views/nodes/${nodeId}/associations/${encodeURIComponent(association)}/views/${encodeURIComponent(viewId)}`,
        { method: "DELETE" },
      );
    },
    async patchRelationshipViews(
      nodeId: string,
      association: string,
      input: {
        viewOrder?: string[];
        properties?: string[];
      },
    ) {
      return fetchJson<{
        views?: import("tome-graph-interfaces").ViewDefinition[];
        properties?: string[];
      }>(
        `/api/views/nodes/${nodeId}/associations/${encodeURIComponent(association)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
    },
    async deleteDatabaseColumn(
      databaseId: string,
      columnKey: string,
    ): Promise<{ rowsAffected: number; relationsUnlinked: number }> {
      return fetchJson<{ rowsAffected: number; relationsUnlinked: number }>(
        `/api/databases/${databaseId}/columns/${encodeURIComponent(columnKey)}`,
        { method: "DELETE" },
      );
    },
    async createDatabaseColumn(
      databaseId: string,
      input: {
        key?: string;
        name: string;
        type: string;
        enumId?: string;
        association?: string;
        viewId?: string;
      },
    ): Promise<{
      column: import("tome-graph-interfaces").TableColumnDef;
      rowsMigrated: number;
      relationsUnlinked: number;
      valuesCleared: number;
    }> {
      return fetchJson(`/api/databases/${databaseId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },
    async updateDatabaseColumn(
      databaseId: string,
      columnKey: string,
      input: {
        name?: string;
        newKey?: string;
        type?: string;
        enumId?: string | null;
        association?: string;
      },
    ): Promise<{
      column: import("tome-graph-interfaces").TableColumnDef;
      rowsMigrated: number;
      relationsUnlinked: number;
      valuesCleared: number;
    }> {
      return fetchJson(
        `/api/databases/${databaseId}/columns/${encodeURIComponent(columnKey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
    },
    async listTypeTables(): Promise<{ id: string; title: string }[]> {
      const data = await fetchJson<{ typeTables: { id: string; title: string }[] }>(
        "/api/type-tables",
      );
      return data.typeTables;
    },
    async reorderDatabaseMembers(
      databaseId: string,
      params: ReorderDatabaseMembersParams,
    ): Promise<DatabaseViewDetail> {
      const data = await fetchJson<{ databaseView: DatabaseViewDetail }>(
        `/api/databases/${databaseId}/members/reorder`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        },
      );
      return data.databaseView;
    },
    async search(
      query: string,
      limit = 20,
      allowedTypeIds?: string[],
      options?: { activeCorpusId?: string },
    ): Promise<NodeSummary[]> {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (allowedTypeIds?.length) {
        params.set("allowedTypeIds", allowedTypeIds.join(","));
      }
      if (options?.activeCorpusId) {
        params.set("activeCorpusId", options.activeCorpusId);
      }
      const data = await fetchJson<{ results: NodeSummary[] }>(
        `/api/nodes/search?${params}`,
      );
      return data.results;
    },
    async listRecent(limit = 8): Promise<NodeSummary[]> {
      const params = new URLSearchParams({ limit: String(limit) });
      const data = await fetchJson<{ results: NodeSummary[] }>(
        `/api/nodes/recent?${params}`,
      );
      return data.results;
    },
    saveNode,
    async saveDocument(id: string, document: NodeBodyDocument): Promise<void> {
      await saveNode(id, { document });
    },
    async saveTitle(id: string, title: string): Promise<void> {
      await saveNode(id, { title });
    },
    async updateDatabaseRowProperty(
      databaseId: string,
      nodeId: string,
      propertyKey: string,
      value: string | null,
    ): Promise<void> {
      await fetchJson(`/api/databases/${databaseId}/rows/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property: propertyKey, value }),
      });
    },
    async updateOutgoingRelationshipProperty(
      nodeId: string,
      type: string,
      targetId: string,
      propertyKey: string,
      value: string | null,
    ): Promise<void> {
      await fetchJson(
        `/api/nodes/${nodeId}/connections/${encodeURIComponent(type)}/${targetId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ property: propertyKey, value }),
        },
      );
    },
    async linkOutgoingRelationship(
      sourceId: string,
      input: { type: string; targetId: string },
    ): Promise<void> {
      await fetchJson(`/api/nodes/${sourceId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },
    async unlinkOutgoingRelationship(
      sourceId: string,
      type: string,
      targetId: string,
    ): Promise<void> {
      await fetchJson(
        `/api/nodes/${sourceId}/connections/${encodeURIComponent(type)}/${targetId}`,
        { method: "DELETE" },
      );
    },
    async moveRelationshipConnection(input: {
      type: string;
      oldSourceId: string;
      oldTargetId: string;
      newSourceId: string;
      newTargetId: string;
    }): Promise<void> {
      await fetchJson("/api/nodes/connections/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    },
    async deleteNode(id: string): Promise<void> {
      await fetchJson(`/api/nodes/${id}`, { method: "DELETE" });
    },
    async archiveNode(id: string): Promise<void> {
      await fetchJson(`/api/nodes/${id}/archive`, { method: "POST" });
    },
    async unarchiveNode(id: string): Promise<void> {
      await fetchJson(`/api/nodes/${id}/unarchive`, { method: "POST" });
    },
    async addQuickLink(
      id: string,
      options?: { label?: string; icon?: string },
    ): Promise<void> {
      await fetchJson(`/api/nodes/${id}/quick-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options ?? {}),
      });
    },
    async removeQuickLink(id: string): Promise<void> {
      await fetchJson(`/api/nodes/${id}/quick-link`, { method: "DELETE" });
    },
    async reorderQuickLinks(nodeIds: readonly string[]): Promise<void> {
      await fetchJson("/api/workspace/quick-links/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds }),
      });
    },
    async getGraphFull(): Promise<GraphSnapshot> {
      const data = await fetchJson<{ graph: GraphSnapshot }>("/api/graph/full");
      return data.graph;
    },
    async getGraphExplorerLod(options?: GraphExplorerLodOptions): Promise<GraphLodSnapshot> {
      const params = new URLSearchParams();
      if (options?.anchorId) params.set("anchor", options.anchorId);
      if (options?.layerCount !== undefined) params.set("layers", String(options.layerCount));
      const query = params.toString();
      const data = await fetchJson<{ graph: GraphLodSnapshot }>(
        `/api/graph/explorer-lod${query ? `?${query}` : ""}`,
      );
      return data.graph;
    },
    async executeImp(
      graph: import("tome-graph-interfaces").ImpGraph,
      context?: import("tome-graph-interfaces").ExecuteImpContext,
    ): Promise<import("tome-graph-interfaces").ImpCollectionResult> {
      return fetchJson("/api/graph/execute-imp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph, context }),
      });
    },
    async getSchema(): Promise<SchemaFile> {
      const data = await fetchJson<{ schema: SchemaFile }>("/api/schema");
      return data.schema;
    },
    async listRelationshipTypes(): Promise<RelationshipTypeOption[]> {
      const data = await fetchJson<{ types: RelationshipTypeOption[] }>(
        "/api/relationships/types",
      );
      return data.types;
    },
    async getRelationshipLinkOptions(
      sourceId: string,
      type: string,
    ): Promise<{ allowedTargetTypeIds: string[] | null }> {
      const params = new URLSearchParams({ type });
      return fetchJson(
        `/api/nodes/${sourceId}/relationship-link-options?${params.toString()}`,
      );
    },
    async getUserSettings(): Promise<UserSettings> {
      const data = await fetchJson<{ settings: UserSettings }>("/api/user-settings");
      return data.settings;
    },
    async patchUserSettings(patch: UserSettingsPatch): Promise<UserSettings> {
      const data = await fetchJson<{ settings: UserSettings }>("/api/user-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      return data.settings;
    },
    async getExtensionsManifest(): Promise<PublicExtensionsManifest> {
      return fetchJson<PublicExtensionsManifest>("/api/extensions");
    },
    async prepareEditorBody(nodeId: string, markdown: string): Promise<string> {
      const data = await fetchJson<{ markdown: string }>(
        `/api/nodes/${encodeURIComponent(nodeId)}/prepare-editor-body`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown }),
        },
      );
      return data.markdown;
    },
    async invokeExtension(
      componentId: string,
      input?: unknown,
      nodeId?: string,
    ): Promise<unknown> {
      const data = await fetchJson<{ ok: true; data: unknown } | { ok: false; error: string }>(
        `/api/extensions/${encodeURIComponent(componentId)}/invoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, nodeId }),
        },
      );
      if (!data.ok) throw new Error(data.error);
      return data.data;
    },
  };
}

export async function waitForApi(baseUrl: string, attempts = 40): Promise<boolean> {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${normalizedBase}/api/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
