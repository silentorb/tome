import type { NodeLibrary, Port, SignalType } from "imp-core-types";

export const SYNC_SIGNAL_TYPE_ID = "tome.sync.signal";
export const SYNC_STORE_NODE_TYPE = "tome.sync.store";
export const SYNC_OBSERVE_OUT_PORT = "observeOut";
export const SYNC_OBSERVE_IN_PORT = "observeIn";
export const SYNC_STORE_ID_INPUT = "storeId";

const syncSignal: SignalType = { id: SYNC_SIGNAL_TYPE_ID };
const stringType: SignalType = { id: "string" };

function port(id: string, type: SignalType, defaultValue?: Port["defaultValue"]): Port {
  return defaultValue === undefined ? { id, type } : { id, type, defaultValue };
}

/** Built-in sync wiring catalog — floating store nodes with observe ports. */
export function createTomeSyncNodeLibrary(): NodeLibrary {
  return {
    id: "tome.sync",
    definitions: [
      {
        id: SYNC_STORE_NODE_TYPE,
        inputs: {
          [SYNC_STORE_ID_INPUT]: port(SYNC_STORE_ID_INPUT, stringType),
          [SYNC_OBSERVE_IN_PORT]: port(SYNC_OBSERVE_IN_PORT, syncSignal),
        },
        outputs: {
          [SYNC_OBSERVE_OUT_PORT]: port(SYNC_OBSERVE_OUT_PORT, syncSignal),
        },
      },
    ],
  };
}

export interface SyncNodeLibrary {
  id: string;
  catalog: NodeLibrary;
}

export class SyncNodeTypeRegistry {
  private readonly byType = new Map<string, { libraryId: string; definitionId: string }>();
  private readonly libraries: SyncNodeLibrary[] = [];

  register(library: SyncNodeLibrary): void {
    this.libraries.push(library);
    for (const def of library.catalog.definitions) {
      if (this.byType.has(def.id)) {
        throw new Error(
          `Sync node type "${def.id}" already registered (library ${this.byType.get(def.id)!.libraryId})`,
        );
      }
      this.byType.set(def.id, { libraryId: library.id, definitionId: def.id });
    }
  }

  has(typeId: string): boolean {
    return this.byType.has(typeId);
  }

  listLibraries(): readonly SyncNodeLibrary[] {
    return this.libraries;
  }

  /** Port type id for a node type + port direction, or null if unknown. */
  portSignalTypeId(
    nodeTypeId: string,
    portId: string,
    direction: "input" | "output",
  ): string | null {
    for (const lib of this.libraries) {
      const def = lib.catalog.definitions.find((d) => d.id === nodeTypeId);
      if (!def) continue;
      const ports = direction === "input" ? def.inputs : def.outputs;
      const p = ports[portId];
      if (!p) return null;
      return "id" in p.type ? p.type.id : null;
    }
    return null;
  }
}

export function createDefaultSyncNodeTypeRegistry(): SyncNodeTypeRegistry {
  const registry = new SyncNodeTypeRegistry();
  registry.register({ id: "tome.sync", catalog: createTomeSyncNodeLibrary() });
  return registry;
}
