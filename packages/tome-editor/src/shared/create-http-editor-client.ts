import type {
  GraphSnapshot,
  GraphLodSnapshot,
  NodePageDetail,
  NodeSummary,
  DatabaseViewDetail,
  OrderedAssociationViewDetail,
} from "./types";
import type { UserSettings, UserSettingsPatch } from "./user-settings";
import type { PublicExtensionsManifest } from "./extensions";
import type { SchemaFile } from "tome-db/schema-file";
import type { OrderedAssociationMoveParams } from "tome-db";
import type {
  CreateNodeResponse,
  EditorApiClient,
  GetNodeOptions,
  GraphExplorerLodOptions,
  WorkspacePublic,
} from "./http-client-types";

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

export function createHttpEditorClient(baseUrl: string): EditorApiClient {
  const normalizedBase = baseUrl.replace(/\/$/, "");

  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${normalizedBase}${path}`, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiError(text, res.status));
    }
    return (await res.json()) as T;
  }

  return {
    async getWorkspace(): Promise<WorkspacePublic> {
      return fetchJson<WorkspacePublic>("/api/workspace");
    },
    async getHomeId(): Promise<string> {
      const data = await fetchJson<{ id: string }>("/api/home");
      return data.id;
    },
    async createNode(input: {
      title: string;
      body?: string;
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
      input: { title: string; view?: string; properties?: Record<string, string> },
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
    async getNode(id: string, options?: GetNodeOptions | string): Promise<NodePageDetail> {
      const normalized =
        typeof options === "string" ? { tab: options } : (options ?? {});
      const params = new URLSearchParams();
      const tab = normalized.tab ?? normalized.scope ?? normalized.view;
      if (tab) params.set("tab", tab);
      const query = params.toString();
      const data = await fetchJson<{ node: NodePageDetail }>(
        `/api/nodes/${id}${query ? `?${query}` : ""}`,
      );
      return data.node;
    },
    async getDatabaseView(id: string, tabId?: string): Promise<DatabaseViewDetail> {
      const params = tabId ? `?tab=${encodeURIComponent(tabId)}` : "";
      const data = await fetchJson<{ databaseView: DatabaseViewDetail }>(
        `/api/databases/${id}${params}`,
      );
      return data.databaseView;
    },
    async createRelationshipView(
      nodeId: string,
      relationshipType: string,
      input: {
        name: string;
        sorts?: import("tome-db").ViewSortSpec[];
        properties?: import("tome-db").ViewProperties;
      },
    ) {
      const data = await fetchJson<{ view: import("tome-db").ViewDefinition }>(
        `/api/views/nodes/${nodeId}/relationships/${encodeURIComponent(relationshipType)}/views`,
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
      relationshipType: string,
      viewId: string,
      input: {
        name?: string;
        sorts?: import("tome-db").ViewSortSpec[];
        properties?: import("tome-db").ViewProperties;
      },
    ) {
      const data = await fetchJson<{ view: import("tome-db").ViewDefinition }>(
        `/api/views/nodes/${nodeId}/relationships/${encodeURIComponent(relationshipType)}/views/${encodeURIComponent(viewId)}`,
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
      relationshipType: string,
      viewId: string,
    ): Promise<void> {
      await fetchJson(
        `/api/views/nodes/${nodeId}/relationships/${encodeURIComponent(relationshipType)}/views/${encodeURIComponent(viewId)}`,
        { method: "DELETE" },
      );
    },
    async patchRelationshipViews(
      nodeId: string,
      relationshipType: string,
      input: {
        viewOrder?: string[];
        properties?: import("tome-db").ViewProperties;
      },
    ) {
      return fetchJson<{
        views?: import("tome-db").ViewDefinition[];
        properties?: import("tome-db").ViewProperties;
      }>(
        `/api/views/nodes/${nodeId}/relationships/${encodeURIComponent(relationshipType)}`,
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
        targetTypeId?: string;
        perspective?: string;
      },
    ): Promise<{
      column: import("tome-db").TableColumnDef;
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
        targetTypeId?: string;
        perspective?: string;
      },
    ): Promise<{
      column: import("tome-db").TableColumnDef;
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
    async moveOrderedAssociation(
      configId: string,
      params: OrderedAssociationMoveParams,
    ): Promise<OrderedAssociationViewDetail> {
      const data = await fetchJson<{ view: OrderedAssociationViewDetail }>(
        `/api/ordered-associations/${encodeURIComponent(configId)}/move`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        },
      );
      return data.view;
    },
    async search(
      query: string,
      limit = 20,
      allowedTypeIds?: string[],
      options?: { includeBody?: boolean },
    ): Promise<NodeSummary[]> {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (allowedTypeIds?.length) {
        params.set("allowedTypeIds", allowedTypeIds.join(","));
      }
      if (options?.includeBody) {
        params.set("includeBody", "1");
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
    async saveBody(id: string, body: string): Promise<void> {
      await fetchJson(`/api/nodes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    },
    async saveTitle(id: string, title: string): Promise<void> {
      await fetchJson(`/api/nodes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
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
    async getSchema(): Promise<SchemaFile> {
      const data = await fetchJson<{ schema: SchemaFile }>("/api/schema");
      return data.schema;
    },
    async listRelationshipTypes(): Promise<string[]> {
      const data = await fetchJson<{ types: string[] }>("/api/relationship-types");
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
