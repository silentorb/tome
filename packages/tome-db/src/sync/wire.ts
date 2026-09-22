import type { Graph, Node } from "imp-core-types";
import type { DataStoreRegistry, SyncEndpoint } from "./registry";
import type { SyncNodeTypeRegistry } from "./node-registry";
import {
  SYNC_OBSERVE_IN_PORT,
  SYNC_OBSERVE_OUT_PORT,
  SYNC_SIGNAL_TYPE_ID,
  SYNC_STORE_ID_INPUT,
  SYNC_STORE_NODE_TYPE,
} from "./node-registry";
import type { SyncSignal, SyncSourceRead } from "./types";

export type WiredObserveEdge = {
  fromStoreId: string;
  toStoreId: string;
  fromNodeId: string;
  toNodeId: string;
};

export type SyncGraphWireResult = {
  edges: WiredObserveEdge[];
  /** Unsubscribe all installed observers. */
  dispose: () => void;
  /** Trigger full refresh on every sink that has inbound edges. */
  runInitialFull: () => Promise<void>;
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
   * When set, sqlite sinks that support registerInboundSource receive sources here.
   */
};

/**
 * Interpret a floating sync Imp graph once: validate and install observer relationships.
 * Does not execute Imp collection programs.
 */
export function wireSyncGraph(options: WireSyncGraphOptions): SyncGraphWireResult {
  const { graph, registry, nodeTypes } = options;
  const disposers: Array<() => void> = [];

  for (const node of Object.values(graph.nodes)) {
    if (!nodeTypes.has(node.type)) {
      throw new Error(`Unknown sync node type "${node.type}" on node "${node.id}"`);
    }
    if (node.type === SYNC_STORE_NODE_TYPE) {
      const storeId = storeIdFromNode(node);
      registry.require(storeId);
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

    const fromStoreId = storeIdFromNode(fromNode);
    const toStoreId = storeIdFromNode(toNode);
    const fromEp = registry.endpoint(fromStoreId);
    const toEp = registry.endpoint(toStoreId);

    if (!fromEp.capabilities.canBeObserved) {
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
    });
  }

  assertAcyclic(wired);

  const sinks = new Map<string, SyncEndpoint>();
  for (const e of wired) {
    const fromEp = registry.endpoint(e.fromStoreId);
    const toEp = registry.endpoint(e.toStoreId);
    sinks.set(e.toStoreId, toEp);

    const register = (
      toEp as SyncEndpoint & {
        registerInboundSource?: (id: string, source: SyncSourceRead) => void;
      }
    ).registerInboundSource;
    if (typeof register === "function") {
      register(e.fromStoreId, fromEp.asSource());
    }

    if (fromEp.subscribe) {
      const unsub = fromEp.subscribe((signal: SyncSignal) => {
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
        // Prefer first inbound source for the signal.source field.
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
  };
}

/** Build default observe graph: each flatfile storeId → queryStoreId. */
export function buildDefaultSyncGraph(
  flatfileStoreIds: readonly string[],
  queryStoreId: string,
): Graph {
  const nodes: Graph["nodes"] = {};
  const edges: Graph["edges"] = {};

  nodes[`sink:${queryStoreId}`] = {
    id: `sink:${queryStoreId}`,
    type: SYNC_STORE_NODE_TYPE,
    inputs: { [SYNC_STORE_ID_INPUT]: queryStoreId },
  };

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
  }

  return { nodes, edges };
}
