import type { Graph, Node } from "imp-core-types";
import type { DataStoreRegistry, SyncEndpoint } from "./registry";
import type { SyncNodeTypeRegistry } from "./node-registry";
import {
  SYNC_GIT_WATCH_NODE_TYPE,
  SYNC_OBSERVE_IN_PORT,
  SYNC_OBSERVE_OUT_PORT,
  SYNC_SIGNAL_TYPE_ID,
  SYNC_STORE_ID_INPUT,
  SYNC_STORE_NODE_TYPE,
} from "./node-registry";
import type { SyncSignal, SyncSourceRead } from "./types";

export type WiredObserveEdge = {
  /** Flatfile (or other) corpus storeId associated with the observe source. */
  fromStoreId: string;
  toStoreId: string;
  fromNodeId: string;
  toNodeId: string;
  fromKind: "store" | "gitWatch";
};

export type SyncGraphWireResult = {
  edges: WiredObserveEdge[];
  /** Unsubscribe all installed observers. */
  dispose: () => void;
  /** Trigger full refresh on every sink that has inbound edges. */
  runInitialFull: () => Promise<void>;
  /**
   * After initial full, record Git tip baselines for gitWatch sources.
   * No-op when no git watch endpoints were wired.
   */
  recordGitWatchBaselines: () => Promise<void>;
};

function storeIdFromNode(node: Node): string {
  const raw = node.inputs?.[SYNC_STORE_ID_INPUT];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  throw new Error(
    `Sync graph node "${node.id}" (type ${node.type}) missing string input "${SYNC_STORE_ID_INPUT}"`,
  );
}

function assertAcyclic(edges: WiredObserveEdge[]): void {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.fromStoreId) ?? [];
    list.push(e.toStoreId);
    adj.set(e.fromStoreId, list);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Sync graph contains a cycle involving store "${id}"`);
    }
    visiting.add(id);
    for (const next of adj.get(id) ?? []) dfs(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of adj.keys()) dfs(id);
}

export type WireSyncGraphOptions = {
  graph: Graph;
  registry: DataStoreRegistry;
  nodeTypes: SyncNodeTypeRegistry;
  /**
   * Observe-source endpoints for sync graph node ids that are not dataStores
   * (e.g. `tome.sync.gitWatch` nodes).
   */
  observeSourcesByNodeId?: ReadonlyMap<string, SyncEndpoint>;
};

type GitWatchEndpoint = SyncEndpoint & {
  recordBaselineHash?: () => Promise<void>;
};

/**
 * Interpret a floating sync Imp graph once: validate and install observer relationships.
 * Does not execute Imp collection programs.
 */
export function wireSyncGraph(options: WireSyncGraphOptions): SyncGraphWireResult {
  const { graph, registry, nodeTypes } = options;
  const observeSourcesByNodeId = options.observeSourcesByNodeId ?? new Map();
  const disposers: Array<() => void> = [];
  const gitWatchEndpoints: GitWatchEndpoint[] = [];

  for (const node of Object.values(graph.nodes)) {
    if (!nodeTypes.has(node.type)) {
      throw new Error(`Unknown sync node type "${node.type}" on node "${node.id}"`);
    }
    if (node.type === SYNC_STORE_NODE_TYPE) {
      const storeId = storeIdFromNode(node);
      registry.require(storeId);
    }
    if (node.type === SYNC_GIT_WATCH_NODE_TYPE) {
      const storeId = storeIdFromNode(node);
      registry.require(storeId);
      if (!observeSourcesByNodeId.has(node.id)) {
        throw new Error(
          `Sync graph gitWatch node "${node.id}" has no observe source endpoint (storeId=${storeId})`,
        );
      }
    }
  }

  const wired: WiredObserveEdge[] = [];

  for (const [edgeId, edge] of Object.entries(graph.edges)) {
    const fromNode = graph.nodes[edge.from.node];
    const toNode = graph.nodes[edge.to.node];
    if (!fromNode || !toNode) {
      throw new Error(`Sync graph edge "${edgeId}" references missing nodes`);
    }

    const outType = nodeTypes.portSignalTypeId(fromNode.type, edge.from.port, "output");
    const inType = nodeTypes.portSignalTypeId(toNode.type, edge.to.port, "input");
    if (edge.from.port !== SYNC_OBSERVE_OUT_PORT || edge.to.port !== SYNC_OBSERVE_IN_PORT) {
      throw new Error(
        `Sync graph edge "${edgeId}" must connect ${SYNC_OBSERVE_OUT_PORT} → ${SYNC_OBSERVE_IN_PORT}`,
      );
    }
    if (outType !== SYNC_SIGNAL_TYPE_ID || inType !== SYNC_SIGNAL_TYPE_ID) {
      throw new Error(
        `Sync graph edge "${edgeId}" port types incompatible (got ${outType} → ${inType}, want ${SYNC_SIGNAL_TYPE_ID})`,
      );
    }

    if (toNode.type !== SYNC_STORE_NODE_TYPE) {
      throw new Error(
        `Sync graph edge "${edgeId}" observeIn must target a ${SYNC_STORE_NODE_TYPE} node`,
      );
    }

    const fromStoreId = storeIdFromNode(fromNode);
    const toStoreId = storeIdFromNode(toNode);
    const toEp = registry.endpoint(toStoreId);

    const fromKind: "store" | "gitWatch" =
      fromNode.type === SYNC_GIT_WATCH_NODE_TYPE ? "gitWatch" : "store";

    // Subscribe endpoint: gitWatch node endpoint, or flatfile store endpoint.
    const fromSubscribeEp: SyncEndpoint =
      fromKind === "gitWatch"
        ? observeSourcesByNodeId.get(fromNode.id)!
        : registry.endpoint(fromStoreId);

    // Pull / inbound source always resolves the flatfile (or store) asSource.
    const fromPullEp = registry.endpoint(fromStoreId);

    if (!fromPullEp.capabilities.canBeObserved && fromKind === "store") {
      throw new Error(`Store "${fromStoreId}" cannot be observed (not a valid sync source)`);
    }
    if (fromKind === "store" && !fromSubscribeEp.capabilities.canBeObserved) {
      throw new Error(`Store "${fromStoreId}" cannot be observed (not a valid sync source)`);
    }
    if (!toEp.capabilities.canObserve) {
      throw new Error(`Store "${toStoreId}" cannot observe (not a valid sync sink)`);
    }

    wired.push({
      fromStoreId,
      toStoreId,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      fromKind,
    });

    if (fromKind === "gitWatch") {
      gitWatchEndpoints.push(fromSubscribeEp);
    }
  }

  assertAcyclic(wired);

  const sinks = new Map<string, SyncEndpoint>();
  for (const e of wired) {
    const fromNode = graph.nodes[e.fromNodeId]!;
    const fromSubscribeEp: SyncEndpoint =
      e.fromKind === "gitWatch"
        ? observeSourcesByNodeId.get(fromNode.id)!
        : registry.endpoint(e.fromStoreId);
    const fromPullEp = registry.endpoint(e.fromStoreId);
    const toEp = registry.endpoint(e.toStoreId);
    sinks.set(e.toStoreId, toEp);

    const register = (
      toEp as SyncEndpoint & {
        registerInboundSource?: (id: string, source: SyncSourceRead) => void;
      }
    ).registerInboundSource;
    if (typeof register === "function") {
      register(e.fromStoreId, fromPullEp.asSource());
    }

    if (fromSubscribeEp.subscribe) {
      const unsub = fromSubscribeEp.subscribe((signal: SyncSignal) => {
        void toEp.apply(signal);
      });
      disposers.push(unsub);
    }
  }

  return {
    edges: wired,
    dispose() {
      for (const d of disposers.splice(0)) d();
    },
    async runInitialFull() {
      for (const [sinkId, ep] of sinks) {
        const inbound = wired.find((w) => w.toStoreId === sinkId);
        const source = inbound
          ? registry.endpoint(inbound.fromStoreId).asSource()
          : {
              executeImp() {
                return { columns: ["id"], rows: [] };
              },
            };
        await ep.apply({ source, scope: { mode: "full" } });
      }
    },
    async recordGitWatchBaselines() {
      const seen = new Set<SyncEndpoint>();
      for (const ep of gitWatchEndpoints) {
        if (seen.has(ep)) continue;
        seen.add(ep);
        if (typeof ep.recordBaselineHash === "function") {
          await ep.recordBaselineHash();
        }
      }
    },
  };
}

/**
 * Build default observe graph: each flatfile storeId → queryStoreId,
 * and each flatfile → each FTS sink (so search indexing stays in lock-step with the cache).
 */
export function buildDefaultSyncGraph(
  flatfileStoreIds: readonly string[],
  queryStoreId: string,
  ftsStoreIds: readonly string[] = [],
): Graph {
  const nodes: Graph["nodes"] = {};
  const edges: Graph["edges"] = {};

  nodes[`sink:${queryStoreId}`] = {
    id: `sink:${queryStoreId}`,
    type: SYNC_STORE_NODE_TYPE,
    inputs: { [SYNC_STORE_ID_INPUT]: queryStoreId },
  };

  for (const ftsId of ftsStoreIds) {
    nodes[`sink:${ftsId}`] = {
      id: `sink:${ftsId}`,
      type: SYNC_STORE_NODE_TYPE,
      inputs: { [SYNC_STORE_ID_INPUT]: ftsId },
    };
  }

  for (const storeId of flatfileStoreIds) {
    const nodeId = `src:${storeId}`;
    nodes[nodeId] = {
      id: nodeId,
      type: SYNC_STORE_NODE_TYPE,
      inputs: { [SYNC_STORE_ID_INPUT]: storeId },
    };
    edges[`obs:${storeId}->${queryStoreId}`] = {
      from: { node: nodeId, port: SYNC_OBSERVE_OUT_PORT },
      to: { node: `sink:${queryStoreId}`, port: SYNC_OBSERVE_IN_PORT },
    };
    for (const ftsId of ftsStoreIds) {
      edges[`obs:${storeId}->${ftsId}`] = {
        from: { node: nodeId, port: SYNC_OBSERVE_OUT_PORT },
        to: { node: `sink:${ftsId}`, port: SYNC_OBSERVE_IN_PORT },
      };
    }
  }

  return { nodes, edges };
}

/**
 * Ensure every FTS sink is observed by every flatfile source.
 * Idempotent: skips edges/nodes that already exist for the same storeIds.
 * Prefers an existing gitWatch or store observe-source node for each corpus.
 */
export function ensureFtsObserveEdges(
  graph: Graph,
  flatfileStoreIds: readonly string[],
  ftsStoreIds: readonly string[],
): Graph {
  if (ftsStoreIds.length === 0 || flatfileStoreIds.length === 0) return graph;

  const nodes = { ...graph.nodes };
  const edges = { ...graph.edges };

  const sourceNodeIdForStore = new Map<string, string>();
  const sinkNodeIdForStore = new Map<string, string>();
  for (const node of Object.values(nodes)) {
    try {
      const sid = storeIdFromNode(node);
      if (node.type === SYNC_GIT_WATCH_NODE_TYPE || node.type === SYNC_STORE_NODE_TYPE) {
        const hasObserveOut =
          nodeTypesHasObserveOut(node.type) &&
          (node.type === SYNC_GIT_WATCH_NODE_TYPE ||
            !Object.values(edges).some(
              (e) => e.to.node === node.id && e.to.port === SYNC_OBSERVE_IN_PORT,
            ));
        // Prefer gitWatch as the observe source when present.
        if (node.type === SYNC_GIT_WATCH_NODE_TYPE) {
          sourceNodeIdForStore.set(sid, node.id);
        } else if (
          node.type === SYNC_STORE_NODE_TYPE &&
          !sourceNodeIdForStore.has(sid) &&
          hasObserveOut
        ) {
          // Only treat as source if it isn't solely a sink (heuristic: name or later edges).
          sourceNodeIdForStore.set(sid, node.id);
        }
        if (node.type === SYNC_STORE_NODE_TYPE) {
          sinkNodeIdForStore.set(sid, node.id);
        }
      }
    } catch {
      /* ignore malformed; wireSyncGraph will reject later */
    }
  }

  // Refine: a store node that only appears as observeIn target should not be a source.
  for (const storeId of flatfileStoreIds) {
    const nodeId = sourceNodeIdForStore.get(storeId);
    if (!nodeId) continue;
    const node = nodes[nodeId];
    if (!node || node.type !== SYNC_STORE_NODE_TYPE) continue;
    const isSourceInEdges = Object.values(edges).some(
      (e) => e.from.node === nodeId && e.from.port === SYNC_OBSERVE_OUT_PORT,
    );
    const isOnlySink =
      Object.values(edges).some(
        (e) => e.to.node === nodeId && e.to.port === SYNC_OBSERVE_IN_PORT,
      ) && !isSourceInEdges;
    if (isOnlySink) {
      sourceNodeIdForStore.delete(storeId);
    }
  }

  const nodeIdForSink = (storeId: string): string => {
    const existing = sinkNodeIdForStore.get(storeId);
    if (existing) return existing;
    const nodeId = `sink:${storeId}`;
    nodes[nodeId] = {
      id: nodeId,
      type: SYNC_STORE_NODE_TYPE,
      inputs: { [SYNC_STORE_ID_INPUT]: storeId },
    };
    sinkNodeIdForStore.set(storeId, nodeId);
    return nodeId;
  };

  const nodeIdForSource = (storeId: string): string => {
    const existing = sourceNodeIdForStore.get(storeId);
    if (existing) return existing;
    const nodeId = `src:${storeId}`;
    nodes[nodeId] = {
      id: nodeId,
      type: SYNC_STORE_NODE_TYPE,
      inputs: { [SYNC_STORE_ID_INPUT]: storeId },
    };
    sourceNodeIdForStore.set(storeId, nodeId);
    return nodeId;
  };

  for (const ftsId of ftsStoreIds) {
    const sinkNodeId = nodeIdForSink(ftsId);
    for (const storeId of flatfileStoreIds) {
      const srcNodeId = nodeIdForSource(storeId);
      const already = Object.values(edges).some(
        (edge) =>
          edge.from.node === srcNodeId &&
          edge.to.node === sinkNodeId &&
          edge.from.port === SYNC_OBSERVE_OUT_PORT &&
          edge.to.port === SYNC_OBSERVE_IN_PORT,
      );
      if (already) continue;
      // Also skip if any observe edge already connects this storeId's source to this FTS.
      const alreadyViaStoreId = Object.values(edges).some((edge) => {
        const from = nodes[edge.from.node];
        const to = nodes[edge.to.node];
        if (!from || !to) return false;
        try {
          return (
            storeIdFromNode(from) === storeId &&
            storeIdFromNode(to) === ftsId &&
            edge.from.port === SYNC_OBSERVE_OUT_PORT &&
            edge.to.port === SYNC_OBSERVE_IN_PORT
          );
        } catch {
          return false;
        }
      });
      if (alreadyViaStoreId) continue;
      edges[`obs:${storeId}->${ftsId}`] = {
        from: { node: srcNodeId, port: SYNC_OBSERVE_OUT_PORT },
        to: { node: sinkNodeId, port: SYNC_OBSERVE_IN_PORT },
      };
    }
  }

  return { nodes, edges };
}

function nodeTypesHasObserveOut(type: string): boolean {
  return type === SYNC_STORE_NODE_TYPE || type === SYNC_GIT_WATCH_NODE_TYPE;
}
