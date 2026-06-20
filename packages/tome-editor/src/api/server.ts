import { openEditorDatabase } from "./database";
import { UserSettingsStore } from "./user-settings-store";
import { resolveApiPort, resolveContentPath, resolveDbPath } from "./paths";
import type { UserSettingsPatch } from "../shared/user-settings";
import type { NodeLifecycleError, ViewSortSpec } from "tome-db";

export { pickExistingDbPath, resolveApiPort, resolveContentPath, resolveDbPath } from "./paths";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, PATCH, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, PATCH, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function lifecycleStatus(error: NodeLifecycleError): number {
  if (error === "not_found") return 404;
  if (error === "protected") return 403;
  return 409;
}

function lifecycleMessage(error: NodeLifecycleError): string {
  if (error === "not_found") return "not found";
  if (error === "protected") return "protected node";
  if (error === "not_archived") return "not archived";
  return "already archived";
}

export function createApiHandler(
  dbPath = resolveDbPath(),
  userSettingsStore?: UserSettingsStore,
  contentPath = resolveContentPath(),
) {
  const db = openEditorDatabase(dbPath, contentPath);
  const settingsStore = userSettingsStore ?? new UserSettingsStore();

  const fetchHandler = async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return corsPreflight();

    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        return json({ ok: true });
      }

      if (path === "/api/home") {
        return json({ id: db.getHomeId() });
      }

      if (path === "/api/workspace") {
        return json(db.getWorkspace());
      }

      if (path === "/api/graph/full") {
        return json({ graph: db.getGraphFull() });
      }

      if (path === "/api/graph/explorer-lod") {
        const anchor = url.searchParams.get("anchor") ?? undefined;
        const layersRaw = url.searchParams.get("layers");
        const layerCount = layersRaw ? Number.parseInt(layersRaw, 10) : undefined;
        return json({
          graph: db.getGraphExplorerLod({
            anchorId: anchor,
            layerCount: Number.isFinite(layerCount) ? layerCount : undefined,
          }),
        });
      }

      if (path === "/api/schema") {
        return json({ schema: db.getSchema() });
      }

      if (path === "/api/type-tables") {
        return json({ typeTables: db.listTypeTables() });
      }

      if (path === "/api/relationship-types") {
        return json({ types: db.listRelationshipTypes() });
      }

      if (path === "/api/nodes/search") {
        const q = url.searchParams.get("q") ?? "";
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
        const allowedRaw = url.searchParams.get("allowedTypeIds");
        const allowedTypeIds = allowedRaw
          ? allowedRaw.split(",").map((id) => id.trim().toLowerCase()).filter(Boolean)
          : undefined;
        const includeBodyParam = url.searchParams.get("includeBody");
        const includeBody =
          includeBodyParam === "1" || includeBodyParam === "true";
        return json({
          results: db.search(q, limit, allowedTypeIds, { includeBody }),
        });
      }

      if (path === "/api/nodes/recent") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "8", 10);
        return json({ results: db.listRecent(limit) });
      }

      if (path === "/api/nodes" && req.method === "POST") {
        const payload = (await req.json()) as {
          title?: string;
          body?: string;
        };
        if (typeof payload.title !== "string") {
          return json({ error: "title required" }, 400);
        }
        const result = db.createNode({
          title: payload.title,
          body: typeof payload.body === "string" ? payload.body : undefined,
        });
        if (result === "invalid_title") return json({ error: "invalid title" }, 400);
        return json({ node: result });
      }

      if (path === "/api/user-settings") {
        if (req.method === "GET") {
          return json({ settings: settingsStore.read() });
        }
        if (req.method === "PATCH") {
          const payload = (await req.json()) as UserSettingsPatch;
          const settings = settingsStore.patch(payload);
          return json({ settings });
        }
      }

      const linkOptionsMatch =
        /^\/api\/nodes\/([a-f0-9]{32})\/relationship-link-options$/i.exec(path);
      if (linkOptionsMatch && req.method === "GET") {
        const sourceId = linkOptionsMatch[1]!.toLowerCase();
        const type = url.searchParams.get("type");
        if (!type?.trim()) return json({ error: "type query parameter required" }, 400);
        const node = db.getNode(sourceId);
        if (!node) return json({ error: "not found" }, 404);
        return json(db.getRelationshipLinkOptions(sourceId, type));
      }

      const nodeMatch = /^\/api\/nodes\/([a-f0-9]{32})$/i.exec(path);
      if (nodeMatch) {
        const id = nodeMatch[1]!.toLowerCase();
        if (req.method === "GET") {
          const tab =
            url.searchParams.get("tab") ??
            url.searchParams.get("scope") ??
            url.searchParams.get("view") ??
            undefined;
          const node = db.getNode(id, { tabId: tab ?? undefined });
          if (!node) return json({ error: "not found" }, 404);
          return json({ node });
        }
        if (req.method === "PUT") {
          const payload = (await req.json()) as { body?: string; title?: string };
          const hasBody = typeof payload.body === "string";
          const hasTitle = typeof payload.title === "string";
          if (!hasBody && !hasTitle) {
            return json({ error: "body or title required" }, 400);
          }
          if (hasBody) {
            const ok = db.saveBody(id, payload.body!);
            if (!ok) return json({ error: "not found" }, 404);
          }
          if (hasTitle) {
            const ok = db.saveTitle(id, payload.title!);
            if (!ok) return json({ error: "not found" }, 404);
          }
          return json({ ok: true });
        }
        if (req.method === "DELETE") {
          const error = db.deleteNode(id);
          if (error) return json({ error: lifecycleMessage(error) }, lifecycleStatus(error));
          return json({ ok: true });
        }
      }

      const relationRowMatch =
        /^\/api\/nodes\/([a-f0-9]{32})\/relation-rows$/i.exec(path);
      if (relationRowMatch && req.method === "POST") {
        const sourceId = relationRowMatch[1]!.toLowerCase();
        const payload = (await req.json()) as {
          type?: string;
          title?: string;
          properties?: Record<string, string>;
        };
        if (typeof payload.type !== "string" || typeof payload.title !== "string") {
          return json({ error: "type and title required" }, 400);
        }
        const result = db.createRelationRow(sourceId, {
          type: payload.type,
          title: payload.title,
          properties: payload.properties,
        });
        if (result === "invalid_title") return json({ error: "invalid title" }, 400);
        if (result === "source_not_found") return json({ error: "not found" }, 404);
        return json({ node: result });
      }

      const archiveMatch = /^\/api\/nodes\/([a-f0-9]{32})\/archive$/i.exec(path);
      if (archiveMatch && req.method === "POST") {
        const id = archiveMatch[1]!.toLowerCase();
        const error = db.archiveNode(id);
        if (error) return json({ error: lifecycleMessage(error) }, lifecycleStatus(error));
        return json({ ok: true });
      }

      const unarchiveMatch = /^\/api\/nodes\/([a-f0-9]{32})\/unarchive$/i.exec(path);
      if (unarchiveMatch && req.method === "POST") {
        const id = unarchiveMatch[1]!.toLowerCase();
        const error = db.unarchiveNode(id);
        if (error) return json({ error: lifecycleMessage(error) }, lifecycleStatus(error));
        return json({ ok: true });
      }

      const viewsNodeMatch = /^\/api\/views\/nodes\/([a-f0-9]{32})$/i.exec(path);
      if (viewsNodeMatch && req.method === "GET") {
        const nodeId = viewsNodeMatch[1]!.toLowerCase();
        const views = db.getNodeViews(nodeId);
        return json({ views: views ?? null });
      }

      const viewsSectionMatch =
        /^\/api\/views\/nodes\/([a-f0-9]{32})\/sections\/([a-z0-9_-]+)$/i.exec(path);
      if (viewsSectionMatch && req.method === "PATCH") {
        const nodeId = viewsSectionMatch[1]!.toLowerCase();
        const sectionKey = viewsSectionMatch[2]!;
        const payload = (await req.json()) as { columnOrder?: string[]; tabOrder?: string[] };
        const hasColumnOrder = Array.isArray(payload.columnOrder);
        const hasTabOrder = Array.isArray(payload.tabOrder);
        if (!hasColumnOrder && !hasTabOrder) {
          return json({ error: "columnOrder or tabOrder required" }, 400);
        }
        try {
          const response: { columnOrder?: string[]; tabOrder?: import("tome-db").CustomTabDefinition[] } =
            {};
          if (hasColumnOrder) {
            response.columnOrder = db.updateSectionColumnOrder(
              nodeId,
              sectionKey,
              payload.columnOrder!,
            );
          }
          if (hasTabOrder) {
            response.tabOrder = db.updateSectionTabOrder(
              nodeId,
              sectionKey,
              payload.tabOrder!,
            );
          }
          return json(response);
        } catch (err) {
          return json({ error: String(err) }, 400);
        }
      }

      const viewsTabCollectionMatch =
        /^\/api\/views\/nodes\/([a-f0-9]{32})\/sections\/([a-z0-9_-]+)\/tabs$/i.exec(path);
      if (viewsTabCollectionMatch && req.method === "POST") {
        const nodeId = viewsTabCollectionMatch[1]!.toLowerCase();
        const sectionKey = viewsTabCollectionMatch[2]!;
        const payload = (await req.json()) as { name?: string; sorts?: ViewSortSpec[] };
        if (typeof payload.name !== "string" || !payload.name.trim()) {
          return json({ error: "name required" }, 400);
        }
        try {
          const tab = db.createSectionTab(nodeId, sectionKey, {
            name: payload.name,
            sorts: payload.sorts,
          });
          return json({ tab });
        } catch (err) {
          return json({ error: String(err) }, 400);
        }
      }

      const viewsTabMatch =
        /^\/api\/views\/nodes\/([a-f0-9]{32})\/sections\/([a-z0-9_-]+)\/tabs\/([a-z0-9-]+)$/i.exec(
          path,
        );
      if (viewsTabMatch) {
        const nodeId = viewsTabMatch[1]!.toLowerCase();
        const sectionKey = viewsTabMatch[2]!;
        const tabId = viewsTabMatch[3]!;
        if (req.method === "PATCH") {
          const payload = (await req.json()) as { name?: string; sorts?: ViewSortSpec[] };
          try {
            const tab = db.updateSectionTab(nodeId, sectionKey, tabId, payload);
            return json({ tab });
          } catch (err) {
            return json({ error: String(err) }, 400);
          }
        }
        if (req.method === "DELETE") {
          try {
            db.deleteSectionTab(nodeId, sectionKey, tabId);
            return json({ ok: true });
          } catch (err) {
            return json({ error: String(err) }, 400);
          }
        }
      }

      const databaseMatch = /^\/api\/databases\/([a-f0-9]{32})$/i.exec(path);
      if (databaseMatch) {
        const id = databaseMatch[1]!.toLowerCase();
        if (req.method === "GET") {
          const tab =
            url.searchParams.get("tab") ??
            url.searchParams.get("view") ??
            undefined;
          const databaseView = db.getDatabaseView(id, tab ?? undefined);
          if (!databaseView) return json({ error: "not found" }, 404);
          return json({ databaseView });
        }
      }

      const databaseRowsMatch = /^\/api\/databases\/([a-f0-9]{32})\/rows$/i.exec(path);
      if (databaseRowsMatch && req.method === "POST") {
        const databaseId = databaseRowsMatch[1]!.toLowerCase();
        const payload = (await req.json()) as {
          title?: string;
          view?: string;
          properties?: Record<string, string>;
        };
        if (typeof payload.title !== "string") {
          return json({ error: "title required" }, 400);
        }
        const result = db.createNode({
          title: payload.title,
          link: {
            kind: "database-row",
            databaseId,
            view: typeof payload.view === "string" ? payload.view : undefined,
            properties: payload.properties,
          },
        });
        if (result === "invalid_title") return json({ error: "invalid title" }, 400);
        if (result === "database_not_found") return json({ error: "not found" }, 404);
        return json({ node: result });
      }

      const databaseRowMatch =
        /^\/api\/databases\/([a-f0-9]{32})\/rows\/([a-f0-9]{32})$/i.exec(path);
      if (databaseRowMatch && req.method === "PATCH") {
        const databaseId = databaseRowMatch[1]!.toLowerCase();
        const nodeId = databaseRowMatch[2]!.toLowerCase();
        const payload = (await req.json()) as { property?: string; value?: string | null };
        if (typeof payload.property !== "string") {
          return json({ error: "property required" }, 400);
        }
        const value =
          payload.value === null || payload.value === undefined
            ? null
            : String(payload.value);
        const error = db.updateDatabaseRowProperty(
          databaseId,
          nodeId,
          payload.property,
          value,
        );
        if (error === "not_found") return json({ error: "not found" }, 404);
        if (error === "invalid_value") return json({ error: "invalid value" }, 400);
        return json({ ok: true });
      }

      const databaseColumnsMatch = /^\/api\/databases\/([a-f0-9]{32})\/columns$/i.exec(path);
      if (databaseColumnsMatch && req.method === "POST") {
        const databaseId = databaseColumnsMatch[1]!.toLowerCase();
        const payload = (await req.json()) as {
          key?: string;
          name?: string;
          type?: string;
          enumId?: string;
          targetTypeId?: string;
          perspective?: string;
        };
        if (typeof payload.name !== "string" || typeof payload.type !== "string") {
          return json({ error: "name and type required" }, 400);
        }
        const result = db.createDatabaseColumn(databaseId, {
          key: payload.key,
          name: payload.name,
          type: payload.type as import("tome-db").TableColumnDef["type"],
          enumId: payload.enumId,
          targetTypeId: payload.targetTypeId,
          perspective: payload.perspective,
        });
        if (result === "database_not_found") return json({ error: "not found" }, 404);
        if (result === "column_key_taken") return json({ error: "column key taken" }, 409);
        if (
          result === "invalid_name" ||
          result === "invalid_key" ||
          result === "invalid_type" ||
          result === "invalid_enum" ||
          result === "invalid_relation_target"
        ) {
          return json({ error: result }, 400);
        }
        return json(result);
      }

      const databaseColumnMatch =
        /^\/api\/databases\/([a-f0-9]{32})\/columns\/([a-z0-9_]+)$/i.exec(path);
      if (databaseColumnMatch && req.method === "PATCH") {
        const databaseId = databaseColumnMatch[1]!.toLowerCase();
        const columnKey = databaseColumnMatch[2]!.toLowerCase();
        const payload = (await req.json()) as {
          name?: string;
          newKey?: string;
          type?: string;
          enumId?: string | null;
          targetTypeId?: string;
          perspective?: string;
        };
        const result = db.updateDatabaseColumn(databaseId, columnKey, {
          name: payload.name,
          newKey: payload.newKey,
          type: payload.type as import("tome-db").TableColumnDef["type"] | undefined,
          enumId: payload.enumId,
          targetTypeId: payload.targetTypeId,
          perspective: payload.perspective,
        });
        if (result === "database_not_found") return json({ error: "not found" }, 404);
        if (result === "column_not_found") return json({ error: "column not found" }, 404);
        if (result === "column_key_taken") return json({ error: "column key taken" }, 409);
        if (result === "column_not_deletable") {
          return json({ error: "column not editable" }, 400);
        }
        if (
          result === "invalid_name" ||
          result === "invalid_key" ||
          result === "invalid_type" ||
          result === "invalid_enum" ||
          result === "invalid_relation_target"
        ) {
          return json({ error: result }, 400);
        }
        return json(result);
      }

      if (databaseColumnMatch && req.method === "DELETE") {
        const databaseId = databaseColumnMatch[1]!.toLowerCase();
        const columnKey = databaseColumnMatch[2]!.toLowerCase();
        const result = db.deleteDatabaseColumn(databaseId, columnKey);
        if (result === "database_not_found") return json({ error: "not found" }, 404);
        if (result === "column_not_found") return json({ error: "column not found" }, 404);
        if (result === "column_not_deletable") {
          return json({ error: "column not deletable" }, 400);
        }
        return json(result);
      }

      const connectionsMoveMatch = path === "/api/nodes/connections/move";
      if (connectionsMoveMatch && req.method === "POST") {
        const payload = (await req.json()) as {
          type?: string;
          oldSourceId?: string;
          oldTargetId?: string;
          newSourceId?: string;
          newTargetId?: string;
        };
        if (
          typeof payload.type !== "string" ||
          typeof payload.oldSourceId !== "string" ||
          typeof payload.oldTargetId !== "string" ||
          typeof payload.newSourceId !== "string" ||
          typeof payload.newTargetId !== "string"
        ) {
          return json(
            { error: "type, oldSourceId, oldTargetId, newSourceId, and newTargetId required" },
            400,
          );
        }
        const error = db.moveRelationshipConnection({
          type: payload.type,
          oldSourceId: payload.oldSourceId.toLowerCase(),
          oldTargetId: payload.oldTargetId.toLowerCase(),
          newSourceId: payload.newSourceId.toLowerCase(),
          newTargetId: payload.newTargetId.toLowerCase(),
        });
        if (error === "not_found") return json({ error: "not found" }, 404);
        if (error === "source_not_found" || error === "target_not_found") {
          return json({ error: "not found" }, 404);
        }
        if (error === "duplicate") return json({ error: "duplicate" }, 409);
        if (error === "target_type_not_allowed") {
          return json({ error: "target type not allowed" }, 400);
        }
        return json({ ok: true });
      }

      const connectionsPostMatch = /^\/api\/nodes\/([a-f0-9]{32})\/connections$/i.exec(path);
      if (connectionsPostMatch && req.method === "POST") {
        const sourceId = connectionsPostMatch[1]!.toLowerCase();
        const payload = (await req.json()) as {
          type?: string;
          targetId?: string;
        };
        if (typeof payload.type !== "string" || typeof payload.targetId !== "string") {
          return json({ error: "type and targetId required" }, 400);
        }
        const error = db.linkOutgoingRelationship(sourceId, {
          type: payload.type,
          targetId: payload.targetId.toLowerCase(),
        });
        if (error === "source_not_found" || error === "target_not_found") {
          return json({ error: "not found" }, 404);
        }
        if (error === "duplicate") return json({ error: "duplicate" }, 409);
        if (error === "target_type_not_allowed") {
          return json({ error: "target type not allowed" }, 400);
        }
        return json({ ok: true });
      }

      const connectionMatch =
        /^\/api\/nodes\/([a-f0-9]{32})\/connections\/([^/]+)\/([a-f0-9]{32})$/i.exec(path);
      if (connectionMatch && req.method === "DELETE") {
        const sourceId = connectionMatch[1]!.toLowerCase();
        const type = decodeURIComponent(connectionMatch[2]!);
        const targetId = connectionMatch[3]!.toLowerCase();
        const error = db.unlinkOutgoingRelationship(sourceId, type, targetId);
        if (error === "not_found") return json({ error: "not found" }, 404);
        return json({ ok: true });
      }

      if (connectionMatch && req.method === "PATCH") {
        const nodeId = connectionMatch[1]!.toLowerCase();
        const type = decodeURIComponent(connectionMatch[2]!);
        const targetId = connectionMatch[3]!.toLowerCase();
        const payload = (await req.json()) as { property?: string; value?: string | null };
        if (typeof payload.property !== "string") {
          return json({ error: "property required" }, 400);
        }
        const value =
          payload.value === null || payload.value === undefined
            ? null
            : String(payload.value);
        const error = db.updateOutgoingRelationshipProperty(
          nodeId,
          type,
          targetId,
          payload.property,
          value,
        );
        if (error === "not_found") return json({ error: "not found" }, 404);
        if (error === "invalid_value") return json({ error: "invalid value" }, 400);
        return json({ ok: true });
      }

      const moveMatch = /^\/api\/ordered-associations\/([a-z0-9-]+)\/move$/i.exec(path);
      if (moveMatch && req.method === "PATCH") {
        const configId = moveMatch[1]!;
        const payload = (await req.json()) as {
          scopeId?: string;
          sceneId?: string;
          targetGroupId?: string;
          targetIndex?: number;
        };
        if (
          typeof payload.scopeId !== "string" ||
          typeof payload.sceneId !== "string" ||
          typeof payload.targetGroupId !== "string" ||
          typeof payload.targetIndex !== "number"
        ) {
          return json({ error: "scopeId, sceneId, targetGroupId, and targetIndex required" }, 400);
        }
        const view = db.moveOrderedAssociation(configId, {
          scopeId: payload.scopeId,
          sceneId: payload.sceneId,
          targetGroupId: payload.targetGroupId,
          targetIndex: payload.targetIndex,
        });
        if (!view) return json({ error: "not found" }, 404);
        return json({ view });
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 500);
    }
  };

  fetchHandler.close = () => db.close();
  return fetchHandler;
}

export function startApiServer(options?: {
  dbPath?: string;
  port?: number;
  userSettingsStore?: UserSettingsStore;
}) {
  const dbPath = options?.dbPath ?? resolveDbPath();
  const port = options?.port ?? resolveApiPort();
  const handler = createApiHandler(dbPath, options?.userSettingsStore);

  const server = Bun.serve({
    port,
    fetch: handler,
  });

  console.log(`Tome editor API listening on http://127.0.0.1:${port} (${dbPath})`);
  return server;
}

if (import.meta.main) {
  startApiServer();
}
