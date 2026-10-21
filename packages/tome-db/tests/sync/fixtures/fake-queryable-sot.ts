import type { TomeGraphStoreQueryable } from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";

/**
 * Minimal Queryable SoT module for openDataStoreSession composition tests.
 * Return shape matches createPostgresStoreModule.
 */
export function createFakeQueryableStoreModule() {
  return {
    id: "fake-queryable-sot",
    async open() {
      const corpora = [
        {
          id: "default",
          contentDir: "fake://sot",
          access: "readwrite" as const,
          workspace: {
            homeNodeId: "home",
            archiveNodeId: "archive",
          },
        },
      ];
      const graphStore = {
        capabilities: { queryable: true as const, impExecution: "sql" as const },
        contentDir: "fake://sot",
        async close() {},
        subscribe() {
          return () => {};
        },
        startWatching() {},
        stopWatching() {},
        listCorpora() {
          return corpora;
        },
        locateNode() {
          return "default";
        },
        contentDirForNode() {
          return "fake://sot";
        },
        async listNodeIds() {
          return [];
        },
        async getNode() {
          return null;
        },
        async upsertNode() {},
        async deleteNode() {},
        async mergeNodeProperties() {
          return false;
        },
        async archiveNodeFile() {
          return false;
        },
        async unarchiveNodeFile() {
          return false;
        },
        async isNodeArchived() {
          return false;
        },
        async listRelationshipProjections() {
          return [];
        },
        async getRelationship() {
          return null;
        },
        async upsertRelationship() {},
        async deleteRelationship() {},
        async readRelationshipTypes() {
          return { associations: {} };
        },
        async writeRelationshipTypes() {},
        async readSchema() {
          return { enums: {} };
        },
        async writeSchema() {},
        async readViews() {
          return { views: {} };
        },
        async writeViews() {},
        async readTableSchemas() {
          return { tables: {} };
        },
        async writeTableSchemas() {},
        async readDynamicProperties() {
          return { properties: {} };
        },
        async writeDynamicProperties() {},
        async readWorkspace() {
          return corpora[0]!.workspace;
        },
        async writeWorkspace() {},
        async upsertNodeToCorpus() {},
        async writeWorkspaceForCorpus() {},
        async executeImp() {
          return { columns: ["id"], rows: [] };
        },
      } as unknown as TomeGraphStoreQueryable;

      const cache = {
        path: "fake://cache",
        async close() {},
        async finalize() {},
        async queryAll() {
          return [];
        },
        async runExec() {},
        async transaction(fn: (c: TomeQueryCache) => Promise<unknown>) {
          return fn(cache);
        },
      } as unknown as TomeQueryCache;

      return {
        graphStore,
        cache,
        async close() {},
      };
    },
  };
}

export function createFakeFtsModule() {
  return {
    id: "fake-fts",
    open() {
      return {
        search: {
          search: async () => [],
          searchWindow: async () => ({ hits: [], total: 0 }),
        },
        close() {},
      };
    },
  };
}
