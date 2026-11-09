import type { SyncEndpoint, SyncSignal } from "tome-service-interfaces/sync";

/** Test stub that records applied signals (fan-out tests). */
export function createStubSyncEndpointRecording(id: string): {
  endpoint: SyncEndpoint;
  applied: SyncSignal[];
} {
  const applied: SyncSignal[] = [];
  const endpoint: SyncEndpoint = {
    id,
    capabilities: {
      kind: "unknown",
      canBeObserved: true,
      canObserve: true,
    },
    asSource() {
      return {
        executeImp() {
          return { columns: ["id"], rows: [] };
        },
      };
    },
    apply(signal) {
      applied.push(signal);
    },
  };
  return { endpoint, applied };
}
