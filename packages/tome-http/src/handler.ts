import type {
  NodeBodyDocument,
  NodeLifecycleError,
  QuickLinkError,
  TomeGraphServices,
  ViewSortSpec,
} from "tome-graph-interfaces";
import type { CacheSyncPublicStatus } from "tome-service-interfaces";
import {
  getProfilingConfig,
  getProfilingStore,
  isProfilingEnabled,
  PROFILING_SPANS_TABLE,
  runInProfilingTraceAsync,
  withProfilingSpanAsync,
} from "tome-service-interfaces";
import { isPersistableNodeTitle } from "tome-graph-interfaces";
import type { UserSettingsPatch } from "./user-settings";
import { UserSettingsStore } from "./user-settings-store";
import { tableRowsQueryFromSearchParams } from "./table-rows-query";
import { executeProfilingImp } from "./profiling-imp";
import type { AuthenticationProvider } from "tome-interfaces/authentication";
import type { Principal } from "./identity";
import {
  decideImpQuery,
  decideModification,
  defaultAuthorizerGetter,
  type Authorizer,
} from "./authorization";
import {
  extractSessionIdFromRequest,
  getRequestPrincipal,
  runWithRequestPrincipalAsync,
} from "./request-principal";
import {
  clearSessionCookieHeader,
  sessionCookieHeader,
} from "./session-cookie";
import { InMemorySessionStore, type SessionStore } from "./session-store";

function json(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
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

function quickLinkStatus(error: QuickLinkError): number {
  if (error === "not_found") return 404;
  if (error === "invalid_order") return 400;
  return 409;
}

function quickLinkMessage(error: QuickLinkError): string {
  if (error === "not_found") return "not found";
  if (error === "already_exists") return "already a quick link";
  if (error === "invalid_order") return "invalid quick link order";
  return "not a quick link";
}

export type ApiFetchHandler = ((req: Request) => Promise<Response>) & {
  close: () => void | Promise<void>;
};

export type CreateApiHandlerOptions = {
  getCacheSyncStatus?: () => CacheSyncPublicStatus;
  /**
   * Session persistence for request identity. Defaults to an in-memory store.
   * Pass a custom store later (e.g. user SQL); omit only if tests need a fresh store instance.
   */
  sessionStore?: SessionStore;
  /**
   * Opened authentication provider (OIDC, etc.). When absent, `/api/auth/*` returns 404.
   * Prefer a getter so extension reload can swap the provider without recreating the handler.
   */
  getAuthenticationProvider?: () => AuthenticationProvider | null | undefined;
  /**
   * Denial authorizer. When omitted, defaults to deny-everything (fail closed).
   * Pass allow-everything explicitly for light solo / tests.
   */
  getAuthorizer?: () => Authorizer;
  /**
   * When set (user corpus configured), session create must pass an Account node id.
   * Return false → 400 `unknown_account`.
   */
  validateAccountNodeId?: (accountNodeId: string) => boolean | Promise<boolean>;
};

function cacheSyncingPayload(status: CacheSyncPublicStatus) {
  return {
    error: "cache_syncing" as const,
    syncing: true as const,
    ...(status.phase != null ? { phase: status.phase } : {}),
    ...(status.progress != null ? { progress: status.progress } : {}),
    ...(status.current != null ? { current: status.current } : {}),
    ...(status.total != null ? { total: status.total } : {}),
    ...(status.message != null ? { message: status.message } : {}),
  };
}

function healthPayload(
  status: CacheSyncPublicStatus | undefined,
  principal: Principal | null,
) {
  if (!status) {
    return {
      ok: true as const,
      ready: true as const,
      syncing: false as const,
      principal,
    };
  }
  return {
    ok: true as const,
    ready: status.ready,
    syncing: status.syncing,
    principal,
    ...(status.phase != null ? { phase: status.phase } : {}),
    ...(status.progress != null ? { progress: status.progress } : {}),
    ...(status.current != null ? { current: status.current } : {}),
    ...(status.total != null ? { total: status.total } : {}),
    ...(status.message != null ? { message: status.message } : {}),
  };
}

async function resolvePrincipalFromRequest(
  req: Request,
  sessionStore: SessionStore,
): Promise<Principal | null> {
  const sessionId = extractSessionIdFromRequest(req);
  if (!sessionId) return null;
  const session = await sessionStore.get(sessionId);
  if (!session) return null;
  return { accountNodeId: session.accountNodeId };
}

/** Build the HTTP fetch handler against graph services (no DB/path opening). */
export function createApiHandler(
  db: TomeGraphServices,
  userSettingsStore: UserSettingsStore,
  options?: CreateApiHandlerOptions,
): ApiFetchHandler {
  const settingsStore = userSettingsStore;
  const getCacheSyncStatus = options?.getCacheSyncStatus;
  const sessionStore = options?.sessionStore ?? new InMemorySessionStore();
  const getAuthenticationProvider = options?.getAuthenticationProvider;
  const getAuthorizer = options?.getAuthorizer ?? defaultAuthorizerGetter;
  const validateAccountNodeId = options?.validateAccountNodeId;

  const fetchHandler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    const principal = await resolvePrincipalFromRequest(req, sessionStore);

    if (!isProfilingEnabled()) {
      return runWithRequestPrincipalAsync(principal, () =>
        dispatchApiRequest(
          req,
          url,
          path,
          db,
          settingsStore,
          getCacheSyncStatus,
          sessionStore,
          getAuthenticationProvider,
          getAuthorizer,
          validateAccountNodeId,
        ),
      );
    }

    return runInProfilingTraceAsync(async () => {
      const httpAttrs: Record<string, string | number | boolean> = {
        "http.method": req.method,
        "http.route": path,
      };
      if (url.search) {
        httpAttrs["url.query"] = url.search.slice(1);
      }
      const spanName = `${req.method} ${path}`;
      return withProfilingSpanAsync(spanName, "SERVER", httpAttrs, async () => {
        try {
          const response = await runWithRequestPrincipalAsync(principal, () =>
            dispatchApiRequest(
              req,
              url,
              path,
              db,
              settingsStore,
              getCacheSyncStatus,
              sessionStore,
              getAuthenticationProvider,
              getAuthorizer,
              validateAccountNodeId,
            ),
          );
          // Mutable attrs bag — status is set before the span's finally records.
          httpAttrs["http.status_code"] = response.status;
          return response;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[tome-http] ${req.method} ${path} → 500:`, err);
          httpAttrs["http.status_code"] = 500;
          return json({ error: message }, 500);
        }
      });
    });
  };

  fetchHandler.close = () => {};
  return fetchHandler;
}

async function dispatchApiRequest(
  req: Request,
  url: URL,
  path: string,
  db: TomeGraphServices,
  settingsStore: UserSettingsStore,
  getCacheSyncStatus: CreateApiHandlerOptions["getCacheSyncStatus"],
  sessionStore: SessionStore,
  getAuthenticationProvider: CreateApiHandlerOptions["getAuthenticationProvider"],
  getAuthorizer: () => Authorizer,
  validateAccountNodeId?: CreateApiHandlerOptions["validateAccountNodeId"],
): Promise<Response> {
      const syncStatus = getCacheSyncStatus?.();

      const forbiddenIfImpDenied = async (
        graph: unknown,
        context?: unknown,
      ): Promise<Response | null> => {
        const decision = await decideImpQuery(
          getAuthorizer(),
          getRequestPrincipal(),
          { graph, context },
        );
        return decision === "deny" ? json({ error: "forbidden" }, 403) : null;
      };

      const forbiddenIfModificationDenied = async (
        modification: string,
        payload?: unknown,
      ): Promise<Response | null> => {
        const decision = await decideModification(
          getAuthorizer(),
          getRequestPrincipal(),
          { modification, payload },
        );
        return decision === "deny" ? json({ error: "forbidden" }, 403) : null;
      };

      if (path === "/api/health") {
        return json(healthPayload(syncStatus, getRequestPrincipal()));
      }

      if (path === "/api/me" && req.method === "GET") {
        return json({ principal: getRequestPrincipal() });
      }

      if (path === "/api/auth/login" && req.method === "GET") {
        const provider = getAuthenticationProvider?.() ?? null;
        if (!provider) {
          return json({ error: "authentication_not_configured" }, 404);
        }
        return provider.beginLogin(req);
      }

      if (path === "/api/auth/callback" && req.method === "GET") {
        const provider = getAuthenticationProvider?.() ?? null;
        if (!provider) {
          return json({ error: "authentication_not_configured" }, 404);
        }
        return provider.handleCallback(req);
      }

      if (path === "/api/sessions" && req.method === "POST") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return json({ error: "invalid JSON body" }, 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return json({ error: "body must be an object" }, 400);
        }
        const accountNodeId = (body as { accountNodeId?: unknown }).accountNodeId;
        if (typeof accountNodeId !== "string" || !accountNodeId.trim()) {
          return json({ error: "accountNodeId must be a non-empty string" }, 400);
        }
        const trimmedAccountId = accountNodeId.trim();
        if (validateAccountNodeId) {
          const ok = await validateAccountNodeId(trimmedAccountId);
          if (!ok) {
            return json({ error: "unknown_account" }, 400);
          }
        }
        try {
          const session = await sessionStore.create({
            accountNodeId: trimmedAccountId,
          });
          return json({ session }, 201, {
            "Set-Cookie": sessionCookieHeader(session.id, req),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return json({ error: message }, 400);
        }
      }

      if (path === "/api/sessions" && req.method === "DELETE") {
        const sessionId = extractSessionIdFromRequest(req);
        if (!sessionId) {
          return json({ error: "missing Session authorization" }, 401);
        }
        const existing = await sessionStore.get(sessionId);
        if (!existing) {
          return json({ error: "session not found" }, 404);
        }
        await sessionStore.delete(sessionId);
        return json({ ok: true }, 200, {
          "Set-Cookie": clearSessionCookieHeader(),
        });
      }

      if (path === "/api/debug/profiling" && req.method === "GET") {
        if (!isProfilingEnabled()) {
          return json({ error: "not found" }, 404);
        }
        const store = getProfilingStore();
        return json({
          config: getProfilingConfig(),
          dbPath: store?.dbPath ?? null,
          schema: PROFILING_SPANS_TABLE,
        });
      }

      if (path === "/api/debug/profiling/execute-imp" && req.method === "POST") {
        if (!isProfilingEnabled()) {
          return json({ error: "not found" }, 404);
        }
        const payload = (await req.json()) as { graph?: unknown };
        if (!payload.graph || typeof payload.graph !== "object") {
          return json({ error: "graph object required" }, 400);
        }
        {
          const denied = await forbiddenIfImpDenied(payload.graph);
          if (denied) return denied;
        }
        try {
          const result = executeProfilingImp(
            payload.graph as import("imp-core-types").Graph,
          );
          return json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return json({ error: message }, 400);
        }
      }

      if (syncStatus && !syncStatus.ready) {
        return json(cacheSyncingPayload(syncStatus), 503);
      }

      if (path === "/api/home") {
        const corpus = url.searchParams.get("corpus") ?? undefined;
        return json({ id: await db.getHomeId(corpus || undefined) });
      }

      if (path === "/api/corpora" && req.method === "GET") {
        return json({ corpora: await db.listCorpora() });
      }

      if (path === "/api/workspace") {
        const corpus = url.searchParams.get("corpus") ?? undefined;
        return json(await db.getWorkspace(corpus || undefined));
      }

      if (path === "/api/workspace/document-icon" && req.method === "GET") {
        const corpus = url.searchParams.get("corpus") ?? undefined;
        const result = await db.getDocumentIcon(corpus || undefined);
        if (!result.ok) {
          if (result.error === "not_found") return json({ error: "not found" }, 404);
          if (result.error === "bad_type") return json({ error: "unsupported icon type" }, 400);
          return json({ error: "invalid icon path" }, 400);
        }
        return new Response(result.body, {
          headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "no-store",
          },
        });
      }

      if (path === "/api/workspace/quick-links/order" && req.method === "PUT") {
        {
          const denied = await forbiddenIfModificationDenied("workspace.quick_links.reorder");
          if (denied) return denied;
        }
        const payload = (await req.json()) as { nodeIds?: unknown };
        if (!Array.isArray(payload.nodeIds)) {
          return json({ error: "nodeIds array required" }, 400);
        }
        const nodeIds = payload.nodeIds.filter((id): id is string => typeof id === "string");
        if (nodeIds.length !== payload.nodeIds.length) {
          return json({ error: "invalid quick link order" }, 400);
        }
        const error = await db.reorderQuickLinks(nodeIds);
        if (error) return json({ error: quickLinkMessage(error) }, quickLinkStatus(error));
        return json({ ok: true });
      }

      if (path === "/api/graph/full") {
        return json({ graph: await db.getGraphFull() });
      }

      if (path === "/api/graph/explorer-lod") {
        const anchor = url.searchParams.get("anchor") ?? undefined;
        const layersRaw = url.searchParams.get("layers");
        const layerCount = layersRaw ? Number.parseInt(layersRaw, 10) : undefined;
        return json({
          graph: await db.getGraphExplorerLod({
            anchorId: anchor,
            layerCount: Number.isFinite(layerCount) ? layerCount : undefined,
          }),
        });
      }

      if (path === "/api/nodes/query" && req.method === "POST") {
        const payload = (await req.json()) as {
          graph?: unknown;
          context?: unknown;
        };
        if (!payload.graph || typeof payload.graph !== "object") {
          return json({ error: "graph object required" }, 400);
        }
        const context =
          payload.context && typeof payload.context === "object"
            ? (payload.context as import("tome-graph-interfaces").ExecuteImpContext)
            : undefined;
        {
          const denied = await forbiddenIfImpDenied(payload.graph, context);
          if (denied) return denied;
        }
        const result = await db.executeImp(
          payload.graph as import("tome-graph-interfaces").ImpGraph,
          context,
        );
        return json(result);
      }

      if (path === "/api/schema") {
        return json({ schema: await db.getSchema() });
      }

      if (path === "/api/type-tables") {
        return json({ typeTables: await db.listTypeTables() });
      }

      if (path === "/api/relationships/types") {
        return json({ types: await db.listRelationshipTypes() });
      }

      if (path === "/api/nodes/search") {
        const q = url.searchParams.get("q") ?? "";
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
        const allowedRaw = url.searchParams.get("allowedTypeIds");
        const allowedTypeIds = allowedRaw
          ? allowedRaw.split(",").map((id) => id.trim()).filter(Boolean)
          : undefined;
        const activeCorpus =
          url.searchParams.get("activeCorpus") ?? undefined;
        const participatesInProjectionType =
          url.searchParams.get("participatesInProjectionType") ?? undefined;
        const pickingRoleRaw = url.searchParams.get("onlyActivePickingRole");
        const onlyActivePickingRole =
          pickingRoleRaw === "source" || pickingRoleRaw === "target"
            ? pickingRoleRaw
            : undefined;
        const roleRaw = url.searchParams.get("role");
        const role = roleRaw === "title" ? "title" : "content";
        return json({
          results: await db.search(q, limit, allowedTypeIds, {
            activeCorpus,
            participatesInProjectionType,
            onlyActivePickingRole,
            role,
          }),
          searchAvailable: await db.isSearchAvailable(role),
        });
      }

      if (path === "/api/nodes/recent") {
        const limit = Number.parseInt(url.searchParams.get("limit") ?? "8", 10);
        return json({ results: await db.listRecent(limit) });
      }

      if (path === "/api/nodes" && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("node.create");
          if (denied) return denied;
        }
        const payload = (await req.json()) as {
          title?: string;
          body?: string;
          corpus?: string;
        };
        if (typeof payload.title !== "string") {
          return json({ error: "title required" }, 400);
        }
        const result = await db.createNode({
          title: payload.title,
          body: typeof payload.body === "string" ? payload.body : undefined,
          corpus: typeof payload.corpus === "string" ? payload.corpus : undefined,
        });
        if (result === "invalid_title") return json({ error: "invalid title" }, 400);
        if (result === "corpus_not_found") return json({ error: "corpus not found" }, 404);
        if (result === "corpus_readonly") return json({ error: "corpus readonly" }, 403);
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
        /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/relationship-link-options$/i.exec(path);
      if (linkOptionsMatch && req.method === "GET") {
        const sourceId = linkOptionsMatch[1]!;
        const type = url.searchParams.get("type");
        if (!type?.trim()) return json({ error: "type query parameter required" }, 400);
        const node = await db.getNode(sourceId);
        if (!node) return json({ error: "not found" }, 404);
        return json(await db.getRelationshipLinkOptions(sourceId, type));
      }

      const prepareBodyMatch = /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/prepare-editor-body$/i.exec(path);
      if (prepareBodyMatch && req.method === "POST") {
        const id = prepareBodyMatch[1]!;
        const payload = (await req.json()) as { markdown?: string };
        if (typeof payload.markdown !== "string") {
          return json({ error: "markdown required" }, 400);
        }
        const markdown = await db.prepareEditorBody(id, payload.markdown);
        if (markdown === null) return json({ error: "not found" }, 404);
        return json({ markdown });
      }

      const relationTableMatch =
        /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/relation-tables\/([^/]+)$/i.exec(path);
      if (relationTableMatch && req.method === "GET") {
        const nodeId = relationTableMatch[1]!;
        const perspective = decodeURIComponent(relationTableMatch[2]!);
        const rows = tableRowsQueryFromSearchParams(url.searchParams);
        const section = await db.getRelationTable(nodeId, perspective, rows);
        if (!section) return json({ error: "not found" }, 404);
        return json({ section });
      }

      const nodeMatch = /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})$/i.exec(path);
      if (nodeMatch) {
        const id = nodeMatch[1]!;
        if (req.method === "GET") {
          const tab =
            url.searchParams.get("tab") ??
            url.searchParams.get("scope") ??
            url.searchParams.get("view") ??
            undefined;
          const rows = tableRowsQueryFromSearchParams(url.searchParams);
          const node = await db.getNode(id, { tabId: tab ?? undefined, rows });
          if (!node) return json({ error: "not found" }, 404);
          return json({ node });
        }
        if (req.method === "PATCH") {
          {
            const denied = await forbiddenIfModificationDenied("node.patch");
            if (denied) return denied;
          }
          const payload = (await req.json()) as {
            document?: unknown;
            title?: string;
          };
          const hasDocument =
            payload.document !== null &&
            typeof payload.document === "object" &&
            (payload.document as { version?: unknown }).version === 1 &&
            Array.isArray((payload.document as { content?: unknown }).content);
          const hasTitle = typeof payload.title === "string";
          if (!hasDocument && !hasTitle) {
            return json({ error: "document or title required" }, 400);
          }
          if (hasDocument) {
            const ok = await db.saveDocument(
              id,
              payload.document as NodeBodyDocument,
            );
            if (!ok) return json({ error: "not found" }, 404);
          }
          if (hasTitle) {
            if (!isPersistableNodeTitle(payload.title!)) {
              return json({ error: "invalid title" }, 400);
            }
            const ok = await db.saveTitle(id, payload.title!);
            if (!ok) return json({ error: "not found" }, 404);
          }
          return json({ ok: true });
        }
        if (req.method === "DELETE") {
          {
            const denied = await forbiddenIfModificationDenied("node.delete");
            if (denied) return denied;
          }
          const error = await db.deleteNode(id);
          if (error) return json({ error: lifecycleMessage(error) }, lifecycleStatus(error));
          return json({ ok: true });
        }
      }

      const relationRowMatch =
        /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/relation-rows$/i.exec(path);
      if (relationRowMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("relation_row.create");
          if (denied) return denied;
        }
        const sourceId = relationRowMatch[1]!;
        const payload = (await req.json()) as {
          type?: string;
          title?: string;
          properties?: Record<string, string>;
        };
        if (typeof payload.type !== "string" || typeof payload.title !== "string") {
          return json({ error: "type and title required" }, 400);
        }
        const result = await db.createRelationRow(sourceId, {
          type: payload.type,
          title: payload.title,
          properties: payload.properties,
        });
        if (result === "invalid_title") return json({ error: "invalid title" }, 400);
        if (result === "source_not_found") return json({ error: "not found" }, 404);
        return json({ node: result });
      }

      const archiveMatch = /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/archive$/i.exec(path);
      if (archiveMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("node.archive");
          if (denied) return denied;
        }
        const id = archiveMatch[1]!;
        const error = await db.archiveNode(id);
        if (error) return json({ error: lifecycleMessage(error) }, lifecycleStatus(error));
        return json({ ok: true });
      }

      const unarchiveMatch = /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/unarchive$/i.exec(path);
      if (unarchiveMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("node.unarchive");
          if (denied) return denied;
        }
        const id = unarchiveMatch[1]!;
        const error = await db.unarchiveNode(id);
        if (error) return json({ error: lifecycleMessage(error) }, lifecycleStatus(error));
        return json({ ok: true });
      }

      const quickLinkMatch = /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/quick-link$/i.exec(path);
      if (quickLinkMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("quick_link.add");
          if (denied) return denied;
        }
        const id = quickLinkMatch[1]!;
        let options: { label?: string } | undefined;
        try {
          const payload = (await req.json()) as { label?: string };
          if (payload && typeof payload === "object") {
            options = {
              ...(typeof payload.label === "string" ? { label: payload.label } : {}),
            };
          }
        } catch {
          options = undefined;
        }
        const error = await db.addQuickLink(id, options);
        if (error) return json({ error: quickLinkMessage(error) }, quickLinkStatus(error));
        return json({ ok: true });
      }
      if (quickLinkMatch && req.method === "DELETE") {
        {
          const denied = await forbiddenIfModificationDenied("quick_link.remove");
          if (denied) return denied;
        }
        const id = quickLinkMatch[1]!;
        const error = await db.removeQuickLink(id);
        if (error) return json({ error: quickLinkMessage(error) }, quickLinkStatus(error));
        return json({ ok: true });
      }

      const viewsNodeMatch = /^\/api\/views\/nodes\/([0-9A-HJKMNP-TV-Z]{26})$/i.exec(path);
      if (viewsNodeMatch && req.method === "GET") {
        const nodeId = viewsNodeMatch[1]!;
        const views = await db.getNodeViews(nodeId);
        return json({ views });
      }

      const viewsRelationshipMatch =
        /^\/api\/views\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/relationship-types\/([0-9A-HJKMNP-TV-Z]{26})$/i.exec(path);
      if (viewsRelationshipMatch && req.method === "PATCH") {
        {
          const denied = await forbiddenIfModificationDenied("views.relationship.patch");
          if (denied) return denied;
        }
        const nodeId = viewsRelationshipMatch[1]!;
        const relationshipTypeId = viewsRelationshipMatch[2]!;
        const payload = (await req.json()) as {
          viewOrder?: string[];
          properties?: string[];
        };
        const hasViewOrder = Array.isArray(payload.viewOrder);
        const hasProperties = Array.isArray(payload.properties);
        if (!hasViewOrder && !hasProperties) {
          return json({ error: "viewOrder or properties required" }, 400);
        }
        try {
          const response = await db.patchRelationshipViews(nodeId, relationshipTypeId, {
            ...(hasViewOrder ? { viewOrder: payload.viewOrder } : {}),
            ...(hasProperties ? { properties: payload.properties } : {}),
          });
          return json(response);
        } catch (err) {
          return json({ error: String(err) }, 400);
        }
      }

      const viewsCollectionMatch =
        /^\/api\/views\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/relationship-types\/([0-9A-HJKMNP-TV-Z]{26})\/views$/i.exec(path);
      if (viewsCollectionMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("views.relationship.create");
          if (denied) return denied;
        }
        const nodeId = viewsCollectionMatch[1]!;
        const relationshipTypeId = viewsCollectionMatch[2]!;
        const payload = (await req.json()) as {
          name?: string;
          sorts?: ViewSortSpec[];
          properties?: string[];
        };
        if (typeof payload.name !== "string" || !payload.name.trim()) {
          return json({ error: "name required" }, 400);
        }
        try {
          const view = await db.createRelationshipView(nodeId, relationshipTypeId, {
            name: payload.name,
            sorts: payload.sorts,
            properties: payload.properties,
          });
          return json({ view });
        } catch (err) {
          return json({ error: String(err) }, 400);
        }
      }

      const viewsItemMatch =
        /^\/api\/views\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/relationship-types\/([0-9A-HJKMNP-TV-Z]{26})\/views\/([a-z0-9-]+)$/i.exec(
          path,
        );
      if (viewsItemMatch) {
        const nodeId = viewsItemMatch[1]!;
        const relationshipTypeId = viewsItemMatch[2]!;
        const viewId = viewsItemMatch[3]!;
        if (req.method === "PATCH") {
          {
            const denied = await forbiddenIfModificationDenied("views.relationship.update");
            if (denied) return denied;
          }
          const payload = (await req.json()) as {
            name?: string;
            sorts?: ViewSortSpec[];
            properties?: string[];
          };
          try {
            const view = await db.updateRelationshipView(nodeId, relationshipTypeId, viewId, payload);
            return json({ view });
          } catch (err) {
            return json({ error: String(err) }, 400);
          }
        }
        if (req.method === "DELETE") {
          {
            const denied = await forbiddenIfModificationDenied("views.relationship.delete");
            if (denied) return denied;
          }
          try {
            await db.deleteRelationshipView(nodeId, relationshipTypeId, viewId);
            return json({ ok: true });
          } catch (err) {
            return json({ error: String(err) }, 400);
          }
        }
      }

      const databaseMatch = /^\/api\/databases\/([0-9A-HJKMNP-TV-Z]{26})$/i.exec(path);
      if (databaseMatch) {
        const id = databaseMatch[1]!;
        if (req.method === "GET") {
          const tab =
            url.searchParams.get("tab") ??
            url.searchParams.get("view") ??
            undefined;
          const rows = tableRowsQueryFromSearchParams(url.searchParams);
          const databaseView = await db.getDatabaseView(id, tab ?? undefined, rows);
          if (!databaseView) return json({ error: "not found" }, 404);
          return json({ databaseView });
        }
      }

      const databaseRowsMatch = /^\/api\/databases\/([0-9A-HJKMNP-TV-Z]{26})\/rows$/i.exec(path);
      if (databaseRowsMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("database.row.create");
          if (denied) return denied;
        }
        const databaseId = databaseRowsMatch[1]!;
        const payload = (await req.json()) as {
          title?: string;
          view?: string;
          properties?: Record<string, string>;
          relations?: Array<{ type: string; targetId: string }>;
          orderScopeRelations?: Array<{ type: string; targetId: string }>;
        };
        if (typeof payload.title !== "string") {
          return json({ error: "title required" }, 400);
        }
        const result = await db.createNode({
          title: payload.title,
          link: {
            kind: "database-row",
            databaseId,
            view: typeof payload.view === "string" ? payload.view : undefined,
            properties: payload.properties,
            relations: Array.isArray(payload.relations) ? payload.relations : undefined,
            orderScopeRelations: Array.isArray(payload.orderScopeRelations)
              ? payload.orderScopeRelations
              : undefined,
          },
        });
        if (result === "invalid_title") return json({ error: "invalid title" }, 400);
        if (result === "database_not_found") return json({ error: "not found" }, 404);
        return json({ node: result });
      }

      const sequenceMatch =
        /^\/api\/databases\/([0-9A-HJKMNP-TV-Z]{26})\/sequence$/i.exec(path);
      if (sequenceMatch && req.method === "PATCH") {
        {
          const denied = await forbiddenIfModificationDenied("database.sequence.rewrite");
          if (denied) return denied;
        }
        const databaseId = sequenceMatch[1]!;
        const payload = (await req.json()) as {
          orderedRowIds?: string[];
          tabId?: string;
          groupChange?: { rowId?: string; targetGroupId?: string };
        };
        if (!Array.isArray(payload.orderedRowIds)) {
          return json({ error: "orderedRowIds required" }, 400);
        }
        const groupChange =
          payload.groupChange &&
          typeof payload.groupChange.rowId === "string" &&
          typeof payload.groupChange.targetGroupId === "string"
            ? {
                rowId: payload.groupChange.rowId,
                targetGroupId: payload.groupChange.targetGroupId,
              }
            : undefined;
        const databaseView = await db.rewriteDatabaseSequence(databaseId, {
          orderedRowIds: payload.orderedRowIds.filter((id) => typeof id === "string"),
          tabId: typeof payload.tabId === "string" ? payload.tabId : undefined,
          groupChange,
        });
        if (!databaseView) return json({ error: "not found" }, 404);
        return json({ databaseView });
      }

      const databaseRowMatch =
        /^\/api\/databases\/([0-9A-HJKMNP-TV-Z]{26})\/rows\/([0-9A-HJKMNP-TV-Z]{26})$/i.exec(path);
      if (databaseRowMatch && req.method === "PATCH") {
        {
          const denied = await forbiddenIfModificationDenied("database.row.property");
          if (denied) return denied;
        }
        const databaseId = databaseRowMatch[1]!;
        const nodeId = databaseRowMatch[2]!;
        const payload = (await req.json()) as { property?: string; value?: string | null };
        if (typeof payload.property !== "string") {
          return json({ error: "property required" }, 400);
        }
        const value =
          payload.value === null || payload.value === undefined
            ? null
            : String(payload.value);
        const error = await db.updateDatabaseRowProperty(
          databaseId,
          nodeId,
          payload.property,
          value,
        );
        if (error === "not_found") return json({ error: "not found" }, 404);
        if (error === "invalid_value") return json({ error: "invalid value" }, 400);
        return json({ ok: true });
      }

      const databaseColumnsMatch = /^\/api\/databases\/([0-9A-HJKMNP-TV-Z]{26})\/columns$/i.exec(path);
      if (databaseColumnsMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("database.column.create");
          if (denied) return denied;
        }
        const databaseId = databaseColumnsMatch[1]!;
        const payload = (await req.json()) as {
          key?: string;
          name?: string;
          type?: string;
          enumId?: string;
          association?: string;
          endpoint?: 0 | 1;
          viewId?: string;
        };
        if (typeof payload.name !== "string" || typeof payload.type !== "string") {
          return json({ error: "name and type required" }, 400);
        }
        const result = await db.createDatabaseColumn(databaseId, {
          key: payload.key,
          name: payload.name,
          type: payload.type as import("tome-graph-interfaces").TableColumnDef["type"],
          enumId: payload.enumId,
          association: payload.association,
          endpoint: payload.endpoint,
          viewId: payload.viewId,
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
        /^\/api\/databases\/([0-9A-HJKMNP-TV-Z]{26})\/columns\/([a-z0-9_]+)$/i.exec(path);
      if (databaseColumnMatch && req.method === "PATCH") {
        {
          const denied = await forbiddenIfModificationDenied("database.column.update");
          if (denied) return denied;
        }
        const databaseId = databaseColumnMatch[1]!;
        const columnKey = databaseColumnMatch[2]!.toLowerCase();
        const payload = (await req.json()) as {
          name?: string;
          newKey?: string;
          type?: string;
          enumId?: string | null;
          association?: string;
          endpoint?: 0 | 1;
        };
        const result = await db.updateDatabaseColumn(databaseId, columnKey, {
          name: payload.name,
          newKey: payload.newKey,
          type: payload.type as import("tome-graph-interfaces").TableColumnDef["type"] | undefined,
          enumId: payload.enumId,
          association: payload.association,
          endpoint: payload.endpoint,
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
        {
          const denied = await forbiddenIfModificationDenied("database.column.delete");
          if (denied) return denied;
        }
        const databaseId = databaseColumnMatch[1]!;
        const columnKey = databaseColumnMatch[2]!.toLowerCase();
        const result = await db.deleteDatabaseColumn(databaseId, columnKey);
        if (result === "database_not_found") return json({ error: "not found" }, 404);
        if (result === "column_not_found") return json({ error: "column not found" }, 404);
        if (result === "column_not_deletable") {
          return json({ error: "column not deletable" }, 400);
        }
        return json(result);
      }

      const connectionsMoveMatch = path === "/api/nodes/connections/move";
      if (connectionsMoveMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("connection.move");
          if (denied) return denied;
        }
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
        const error = await db.moveRelationshipConnection({
          type: payload.type,
          oldSourceId: payload.oldSourceId,
          oldTargetId: payload.oldTargetId,
          newSourceId: payload.newSourceId,
          newTargetId: payload.newTargetId,
        });
        if (error === "not_found") return json({ error: "not found" }, 404);
        if (error === "source_not_found" || error === "target_not_found") {
          return json({ error: "not found" }, 404);
        }
        if (error === "duplicate") return json({ error: "duplicate" }, 409);
        if (error === "target_type_not_allowed") {
          return json({ error: "target type not allowed" }, 400);
        }
        if (error === "unresolvable_type") {
          return json({ error: "unresolvable relationship type" }, 400);
        }
        return json({ ok: true });
      }

      const connectionsPostMatch = /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/connections$/i.exec(path);
      if (connectionsPostMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("connection.link");
          if (denied) return denied;
        }
        const sourceId = connectionsPostMatch[1]!;
        const payload = (await req.json()) as {
          type?: string;
          targetId?: string;
        };
        if (typeof payload.type !== "string" || typeof payload.targetId !== "string") {
          return json({ error: "type and targetId required" }, 400);
        }
        const error = await db.linkOutgoingRelationship(sourceId, {
          type: payload.type,
          targetId: payload.targetId,
        });
        if (error === "source_not_found" || error === "target_not_found") {
          return json({ error: "not found" }, 404);
        }
        if (error === "duplicate") return json({ error: "duplicate" }, 409);
        if (error === "target_type_not_allowed") {
          return json({ error: "target type not allowed" }, 400);
        }
        if (error === "unresolvable_type") {
          return json({ error: "unresolvable relationship type" }, 400);
        }
        return json({ ok: true });
      }

      const connectionMatch =
        /^\/api\/nodes\/([0-9A-HJKMNP-TV-Z]{26})\/connections\/([^/]+)\/([0-9A-HJKMNP-TV-Z]{26})$/i.exec(path);
      if (connectionMatch && req.method === "DELETE") {
        {
          const denied = await forbiddenIfModificationDenied("connection.unlink");
          if (denied) return denied;
        }
        const sourceId = connectionMatch[1]!;
        const type = decodeURIComponent(connectionMatch[2]!);
        const targetId = connectionMatch[3]!;
        const error = await db.unlinkOutgoingRelationship(sourceId, type, targetId);
        if (error === "not_found") return json({ error: "not found" }, 404);
        return json({ ok: true });
      }

      if (connectionMatch && req.method === "PATCH") {
        {
          const denied = await forbiddenIfModificationDenied("connection.property");
          if (denied) return denied;
        }
        const nodeId = connectionMatch[1]!;
        const type = decodeURIComponent(connectionMatch[2]!);
        const targetId = connectionMatch[3]!;
        const payload = (await req.json()) as { property?: string; value?: string | null };
        if (typeof payload.property !== "string") {
          return json({ error: "property required" }, 400);
        }
        const value =
          payload.value === null || payload.value === undefined
            ? null
            : String(payload.value);
        const error = await db.updateOutgoingRelationshipProperty(
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

      if (path === "/api/extensions") {
        const manifest = await db.getExtensionsManifest();
        return json(manifest);
      }

      const editorBundleMatch = /^\/api\/extensions\/([^/]+)\/editor\.js$/.exec(path);
      if (editorBundleMatch && req.method === "GET") {
        const extensionId = decodeURIComponent(editorBundleMatch[1]!);
        const bundle = await db.bundleEditorExtension(extensionId);
        if (!bundle) return json({ error: "not found" }, 404);
        return new Response(bundle, {
          headers: {
            // ESM dynamic import() is picky about JS MIME in some browsers.
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }

      const invokeMatch = /^\/api\/extensions\/([^/]+)\/invoke$/.exec(path);
      if (invokeMatch && req.method === "POST") {
        {
          const denied = await forbiddenIfModificationDenied("extension.invoke");
          if (denied) return denied;
        }
        const componentId = decodeURIComponent(invokeMatch[1]!);
        let payload: Record<string, unknown> = {};
        try {
          const parsed = await req.json();
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            payload = parsed as Record<string, unknown>;
          }
        } catch {
          payload = {};
        }
        const nodeId = typeof payload.nodeId === "string" ? payload.nodeId : undefined;
        const input = "input" in payload ? payload.input : payload;
        const result = await db.invokeExtension(componentId, input, nodeId);
        if (!result.ok) return json(result, 404);
        return json(result);
      }

      return json({ error: "not found" }, 404);
}
