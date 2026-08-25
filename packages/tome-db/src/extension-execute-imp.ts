import type { ExtensionExecuteImpServices } from "tome-interfaces/extension-services/execute-imp";
import type { TomeGraphStoreQueryable } from "tome-graph-interfaces";

export function createExtensionExecuteImpServices(
  graphStore: TomeGraphStoreQueryable,
): ExtensionExecuteImpServices {
  return {
    executeImp(graph, context) {
      return graphStore.executeImp(graph, context);
    },
  };
}
