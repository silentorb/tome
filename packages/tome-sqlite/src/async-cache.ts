import type {
  RelationshipPropertyCodec,
  TomeQueryCache,
  TomeQueryCacheOpenOptions,
} from "tome-service-interfaces";
import type { Properties } from "tome-graph-interfaces";
import type { SqliteWorkerRequest, SqliteWorkerResponse } from "./worker/protocol";

const IDENTITY_CODEC: RelationshipPropertyCodec = {
  encode: (properties) => properties,
  decode: (properties) => properties,
};

const METHODS_NEEDING_PERSPECTIVES = new Set([
  "listArchiveMemberIds",
  "listIncludesArchiveMemberIds",
  "recomputeArchivedFlags",
  "searchNodesByTitle",
  "searchNodesByBody",
  "searchNodesLikeWindow",
  "listNodesByTitle",
  "listNodesByModifiedAt",
]);

function decodeRelProps(
  codec: RelationshipPropertyCodec,
  rel: { properties?: Properties } | null | undefined,
): typeof rel {
  if (!rel) return rel;
  return { ...rel, properties: codec.decode(rel.properties ?? {}) };
}

function decodeCallResult(codec: RelationshipPropertyCodec, method: string, result: unknown): unknown {
  if (codec === IDENTITY_CODEC || result == null) return result;
  switch (method) {
    case "getRelationship":
    case "getRelationshipRecord":
      return decodeRelProps(codec, result as { properties?: Properties });
    case "listRelationshipsFromSource":
    case "listRelationshipsToTarget":
    case "listRelationshipsFromSourceForTargetIds":
      return (result as Array<{ properties?: Properties }>).map((r) => decodeRelProps(codec, r));
    case "listRelationshipsFromSourceWindow": {
      const window = result as {
        relationships: Array<{ properties?: Properties }>;
        total: number;
      };
      return {
        ...window,
        relationships: window.relationships.map((r) => decodeRelProps(codec, r)!),
      };
    }
    case "listMemberPage": {
      const page = result as {
        relationships: Array<{ properties?: Properties }>;
        total: number;
      };
      return {
        ...page,
        relationships: page.relationships.map((r) => decodeRelProps(codec, r)!),
      };
    }
    default:
      return result;
  }
}

function encodeCallArgs(codec: RelationshipPropertyCodec, method: string, args: unknown[]): unknown[] {
  if (codec === IDENTITY_CODEC) return args;
  if (method === "upsertRelationship" && args.length >= 4 && args[3] && typeof args[3] === "object") {
    return [args[0], args[1], args[2], codec.encode(args[3] as Properties), ...args.slice(4)];
  }
  if (method === "mergeRelationshipProperties" && args.length >= 2 && args[1] && typeof args[1] === "object") {
    return [args[0], codec.encode(args[1] as Properties), ...args.slice(2)];
  }
  if (
    (method === "upsertRelationshipRecord" || method === "upsertRelationshipProjection") &&
    args[0] &&
    typeof args[0] === "object"
  ) {
    const row = args[0] as { properties?: Properties };
    return [{ ...row, properties: codec.encode(row.properties ?? {}) }, ...args.slice(1)];
  }
  return args;
}

class WorkerSqliteCache implements TomeQueryCache {
  readonly path: string;
  private readonly worker: Worker;
  private readonly codec: RelationshipPropertyCodec;
  private readonly memberPerspectives?: () => readonly string[];
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();
  /** Exclusive lease queue — transaction holds the head until fn completes. */
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(
    worker: Worker,
    path: string,
    codec: RelationshipPropertyCodec,
    memberPerspectives?: () => readonly string[],
  ) {
    this.worker = worker;
    this.path = path;
    this.codec = codec;
    this.memberPerspectives = memberPerspectives;
    this.worker.onmessage = (event: MessageEvent<SqliteWorkerResponse>) => {
      const msg = event.data;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.kind === "error") {
        const err = new Error(msg.message);
        if (msg.stack) err.stack = msg.stack;
        pending.reject(err);
      } else {
        pending.resolve(msg.result);
      }
    };
    this.worker.onerror = (event) => {
      const err = new Error(event.message || "SQLite worker error");
      for (const [, pending] of this.pending) {
        pending.reject(err);
      }
      this.pending.clear();
    };
  }

  static async open(options: TomeQueryCacheOpenOptions & { dbPath: string }): Promise<WorkerSqliteCache> {
    const workerUrl = new URL("./worker/sqlite-worker.ts", import.meta.url);
    const worker = new Worker(workerUrl.href);
    const cache = new WorkerSqliteCache(
      worker,
      options.dbPath,
      options.propertyCodec ?? IDENTITY_CODEC,
      options.memberPerspectives,
    );
    const perspectives = options.memberPerspectives?.() ?? [];
    await cache.rpc({
      kind: "open",
      id: cache.allocId(),
      dbPath: options.dbPath,
      clean: options.clean,
      memberPerspectives: [...perspectives],
    });
    return cache;
  }

  private allocId(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }

  private rpc(request: SqliteWorkerRequest): Promise<unknown> {
    if (this.closed && request.kind !== "close") {
      return Promise.reject(new Error("SQLite worker cache is closed"));
    }
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async call(method: string, args: unknown[]): Promise<unknown> {
    return this.enqueue(async () => {
      if (METHODS_NEEDING_PERSPECTIVES.has(method) && this.memberPerspectives) {
        await this.rpc({
          kind: "call",
          id: this.allocId(),
          method: "setMemberPerspectives",
          args: [[...this.memberPerspectives()]],
        });
      }
      const prepared = encodeCallArgs(this.codec, method, args);
      const result = await this.rpc({
        kind: "call",
        id: this.allocId(),
        method,
        args: prepared,
      });
      return decodeCallResult(this.codec, method, result);
    });
  }

  transaction<T>(fn: (cache: TomeQueryCache) => Promise<T>): Promise<T> {
    return this.enqueue(() => fn(this.createNestedLeaseCache()));
  }

  /**
   * During an exclusive transaction, nested calls skip the outer queue
   * (already held) so BEGIN…ops…COMMIT stay atomic vs other callers.
   */
  private createNestedLeaseCache(): TomeQueryCache {
    const parent = this;
    return new Proxy({} as TomeQueryCache, {
      get(_t, prop) {
        if (prop === "path") return parent.path;
        if (prop === "then") return undefined;
        if (prop === "transaction") {
          return <T,>(inner: (c: TomeQueryCache) => Promise<T>) => inner(parent.createNestedLeaseCache());
        }
        const method = String(prop);
        return (...args: unknown[]) => parent.callDirect(method, args);
      },
    });
  }

  private async callDirect(method: string, args: unknown[]): Promise<unknown> {
    if (METHODS_NEEDING_PERSPECTIVES.has(method) && this.memberPerspectives) {
      await this.rpc({
        kind: "call",
        id: this.allocId(),
        method: "setMemberPerspectives",
        args: [[...this.memberPerspectives()]],
      });
    }
    const prepared = encodeCallArgs(this.codec, method, args);
    const result = await this.rpc({
      kind: "call",
      id: this.allocId(),
      method,
      args: prepared,
    });
    return decodeCallResult(this.codec, method, result);
  }

  // --- TomeQueryCache methods (generated forwarding) ---

  setMeta(key: string, value: string): Promise<void> {
    return this.call("setMeta", [key, value]) as Promise<void>;
  }
  getMeta(key: string): Promise<string | null> {
    return this.call("getMeta", [key]) as Promise<string | null>;
  }
  upsertNode(id: string, properties?: Properties): Promise<void> {
    return this.call("upsertNode", [id, properties]) as Promise<void>;
  }
  mergeNodeProperties(id: string, properties: Properties): Promise<void> {
    return this.call("mergeNodeProperties", [id, properties]) as Promise<void>;
  }
  getNode(id: string): Promise<import("tome-graph-interfaces").Node | null> {
    return this.call("getNode", [id]) as Promise<import("tome-graph-interfaces").Node | null>;
  }
  deleteNode(id: string): Promise<boolean> {
    return this.call("deleteNode", [id]) as Promise<boolean>;
  }
  isNodeArchived(id: string): Promise<boolean> {
    return this.call("isNodeArchived", [id]) as Promise<boolean>;
  }
  clearRelationshipCache(): Promise<void> {
    return this.call("clearRelationshipCache", []) as Promise<void>;
  }
  upsertRelationshipRecord(
    record: import("tome-service-interfaces").RelationshipRecordRow,
  ): Promise<void> {
    return this.call("upsertRelationshipRecord", [record]) as Promise<void>;
  }
  upsertRelationshipProjection(
    projection: import("tome-service-interfaces").RelationshipProjectionRow,
  ): Promise<void> {
    return this.call("upsertRelationshipProjection", [projection]) as Promise<void>;
  }
  upsertRelationship(
    sourceNodeId: string,
    targetNodeId: string,
    type: string,
    properties?: Properties,
  ): Promise<void> {
    return this.call("upsertRelationship", [sourceNodeId, targetNodeId, type, properties]) as Promise<void>;
  }
  mergeRelationshipProperties(id: string, properties: Properties): Promise<void> {
    return this.call("mergeRelationshipProperties", [id, properties]) as Promise<void>;
  }
  deleteRelationship(sourceNodeId: string, targetNodeId: string, type: string): Promise<boolean> {
    return this.call("deleteRelationship", [sourceNodeId, targetNodeId, type]) as Promise<boolean>;
  }
  getRelationshipRecord(
    id: string,
  ): Promise<import("tome-service-interfaces").RelationshipRecordRow | null> {
    return this.call("getRelationshipRecord", [id]) as Promise<
      import("tome-service-interfaces").RelationshipRecordRow | null
    >;
  }
  getRelationship(id: string): Promise<import("tome-graph-interfaces").Relationship | null> {
    return this.call("getRelationship", [id]) as Promise<
      import("tome-graph-interfaces").Relationship | null
    >;
  }
  listArchiveMemberIds(
    archiveId: string,
    memberPerspectives?: readonly string[],
  ): Promise<string[]> {
    return this.call("listArchiveMemberIds", [archiveId, memberPerspectives]) as Promise<string[]>;
  }
  recomputeArchivedFlags(
    archiveId: string | readonly string[],
    memberPerspectives?: readonly string[],
  ): Promise<void> {
    return this.call("recomputeArchivedFlags", [archiveId, memberPerspectives]) as Promise<void>;
  }
  counts(): Promise<import("tome-service-interfaces").GraphCounts> {
    return this.call("counts", []) as Promise<import("tome-service-interfaces").GraphCounts>;
  }
  searchNodesByTitle(
    pattern: string,
    limit: number,
    allowedTypeIds?: readonly string[],
    allowedNodeIds?: ReadonlySet<string>,
  ): Promise<{ id: string; title: string }[]> {
    return this.call("searchNodesByTitle", [
      pattern,
      limit,
      allowedTypeIds,
      allowedNodeIds,
    ]) as Promise<{ id: string; title: string }[]>;
  }
  searchNodesByBody(
    pattern: string,
    limit: number,
    allowedTypeIds?: readonly string[],
    allowedNodeIds?: ReadonlySet<string>,
  ): Promise<{ id: string; title: string }[]> {
    return this.call("searchNodesByBody", [
      pattern,
      limit,
      allowedTypeIds,
      allowedNodeIds,
    ]) as Promise<{ id: string; title: string }[]>;
  }
  searchNodesLikeWindow(
    pattern: string,
    options: {
      offset?: number;
      limit?: number | null;
      allowedTypeIds?: readonly string[];
      allowedNodeIds?: ReadonlySet<string>;
    },
  ): Promise<{ rows: { id: string; title: string }[]; total: number }> {
    return this.call("searchNodesLikeWindow", [pattern, options]) as Promise<{
      rows: { id: string; title: string }[];
      total: number;
    }>;
  }
  listNodesByTitle(
    limit: number,
    allowedTypeIds?: readonly string[],
    allowedNodeIds?: ReadonlySet<string>,
  ): Promise<{ id: string; title: string }[]> {
    return this.call("listNodesByTitle", [limit, allowedTypeIds, allowedNodeIds]) as Promise<
      { id: string; title: string }[]
    >;
  }
  listNodesByModifiedAt(
    limit: number,
    allowedTypeIds?: readonly string[],
  ): Promise<{ id: string; title: string }[]> {
    return this.call("listNodesByModifiedAt", [limit, allowedTypeIds]) as Promise<
      { id: string; title: string }[]
    >;
  }
  listNodeIdsForProjectionType(projectionType: string): Promise<string[]> {
    return this.call("listNodeIdsForProjectionType", [projectionType]) as Promise<string[]>;
  }
  listSourceNodeIdsForProjectionType(projectionType: string): Promise<string[]> {
    return this.call("listSourceNodeIdsForProjectionType", [projectionType]) as Promise<string[]>;
  }
  listNodesWithBodyLike(pattern: string): Promise<{ id: string; body: string }[]> {
    return this.call("listNodesWithBodyLike", [pattern]) as Promise<{ id: string; body: string }[]>;
  }
  listNodesForGraphExport(): Promise<{ id: string; title: string }[]> {
    return this.call("listNodesForGraphExport", []) as Promise<{ id: string; title: string }[]>;
  }
  listRelationshipsForGraphExport(): Promise<
    { id: string; sourceNodeId: string; targetNodeId: string; type: string }[]
  > {
    return this.call("listRelationshipsForGraphExport", []) as Promise<
      { id: string; sourceNodeId: string; targetNodeId: string; type: string }[]
    >;
  }
  listRelationshipsFromSource(
    sourceNodeId: string,
    type?: string,
  ): Promise<import("tome-graph-interfaces").Relationship[]> {
    return this.call("listRelationshipsFromSource", [sourceNodeId, type]) as Promise<
      import("tome-graph-interfaces").Relationship[]
    >;
  }
  listRelationshipsToTarget(
    targetNodeId: string,
    type?: string,
  ): Promise<import("tome-graph-interfaces").Relationship[]> {
    return this.call("listRelationshipsToTarget", [targetNodeId, type]) as Promise<
      import("tome-graph-interfaces").Relationship[]
    >;
  }
  listOutgoingProjectionTypes(sourceNodeId: string): Promise<string[]> {
    return this.call("listOutgoingProjectionTypes", [sourceNodeId]) as Promise<string[]>;
  }
  listOutgoingProjectionPropertyKeys(sourceNodeId: string, type: string): Promise<string[]> {
    return this.call("listOutgoingProjectionPropertyKeys", [sourceNodeId, type]) as Promise<string[]>;
  }
  listRelationshipsFromSourceWindow(
    sourceNodeId: string,
    type: string,
    query?: import("tome-service-interfaces").RelationshipProjectionWindowQuery,
  ): Promise<import("tome-service-interfaces").RelationshipProjectionWindowResult> {
    return this.call("listRelationshipsFromSourceWindow", [sourceNodeId, type, query]) as Promise<
      import("tome-service-interfaces").RelationshipProjectionWindowResult
    >;
  }
  listMemberPage(
    setId: string,
    query: import("tome-service-interfaces").MemberPageQuery,
  ): Promise<import("tome-service-interfaces").MemberPageResult> {
    return this.call("listMemberPage", [setId, query]) as Promise<
      import("tome-service-interfaces").MemberPageResult
    >;
  }
  listMemberPageNodeIds(
    setId: string,
    query: import("tome-service-interfaces").MemberPageQuery,
  ): Promise<string[]> {
    return this.call("listMemberPageNodeIds", [setId, query]) as Promise<string[]>;
  }
  listRelatedTargetNodeIds(sourceNodeId: string, type: string): Promise<string[]> {
    return this.call("listRelatedTargetNodeIds", [sourceNodeId, type]) as Promise<string[]>;
  }
  listRelationshipsFromSourceForTargetIds(
    sourceNodeId: string,
    type: string,
    targetIds: readonly string[],
  ): Promise<import("tome-graph-interfaces").Relationship[]> {
    return this.call("listRelationshipsFromSourceForTargetIds", [
      sourceNodeId,
      type,
      targetIds,
    ]) as Promise<import("tome-graph-interfaces").Relationship[]>;
  }
  listDistinctSetMemberScopeIds(
    setId: string,
    query: import("tome-service-interfaces").DistinctSetMemberScopeQuery,
  ): Promise<import("tome-service-interfaces").DistinctSetMemberScopeRow[]> {
    return this.call("listDistinctSetMemberScopeIds", [setId, query]) as Promise<
      import("tome-service-interfaces").DistinctSetMemberScopeRow[]
    >;
  }
  getExpressionIndexStatus(
    digest: string,
  ): Promise<"ready" | "stale" | "building" | "missing"> {
    return this.call("getExpressionIndexStatus", [digest]) as Promise<
      "ready" | "stale" | "building" | "missing"
    >;
  }
  replaceExpressionIndexValues(
    digest: string,
    expressionJson: string,
    values: readonly { memberId: string; sortValue: number }[],
  ): Promise<void> {
    return this.call("replaceExpressionIndexValues", [digest, expressionJson, values]) as Promise<void>;
  }
  upsertExpressionIndexValues(
    digest: string,
    expressionJson: string,
    values: readonly { memberId: string; sortValue: number }[],
  ): Promise<void> {
    return this.call("upsertExpressionIndexValues", [digest, expressionJson, values]) as Promise<void>;
  }
  deleteExpressionIndexValues(digest: string, memberIds: readonly string[]): Promise<void> {
    return this.call("deleteExpressionIndexValues", [digest, memberIds]) as Promise<void>;
  }
  getExpressionIndexDirtyMemberIds(digest: string): Promise<string[] | null> {
    return this.call("getExpressionIndexDirtyMemberIds", [digest]) as Promise<string[] | null>;
  }
  markExpressionIndexesStale(digest?: string): Promise<void> {
    return this.call("markExpressionIndexesStale", [digest]) as Promise<void>;
  }
  markExpressionIndexesStaleForTypes(
    types: readonly string[],
    dirtyMemberIds?: readonly string[],
  ): Promise<void> {
    return this.call("markExpressionIndexesStaleForTypes", [types, dirtyMemberIds]) as Promise<void>;
  }
  listComposedGroupHeaders(
    query: import("tome-service-interfaces").ComposedGroupHeadersQuery,
  ): Promise<import("tome-service-interfaces").ComposedGroupHeaderRow[]> {
    return this.call("listComposedGroupHeaders", [query]) as Promise<
      import("tome-service-interfaces").ComposedGroupHeaderRow[]
    >;
  }
  countIncidentRelationships(nodeId: string): Promise<number> {
    return this.call("countIncidentRelationships", [nodeId]) as Promise<number>;
  }
  listDistinctRelationshipTypes(): Promise<string[]> {
    return this.call("listDistinctRelationshipTypes", []) as Promise<string[]>;
  }
  queryAll<T extends Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.call("queryAll", [sql, ...params]) as Promise<T[]>;
  }
  runExec(sql: string, ...params: unknown[]): Promise<void> {
    return this.call("runExec", [sql, ...params]) as Promise<void>;
  }
  finalize(): Promise<void> {
    return this.call("finalize", []) as Promise<void>;
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.rpc({ kind: "close", id: this.allocId() });
    } finally {
      this.worker.terminate();
    }
  }
}

/** Open a worker-backed async SQLite cache (SQL does not block the main event loop). */
export async function openWorkerSqliteCache(
  options: TomeQueryCacheOpenOptions & { dbPath: string },
): Promise<TomeQueryCache> {
  return WorkerSqliteCache.open(options);
}
