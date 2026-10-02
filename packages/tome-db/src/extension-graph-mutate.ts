import type { ExtensionGraphMutateServices } from "tome-interfaces/extension-services/graph-mutate";
import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "./content/write-context";
import {
  writeStoreReplaceRelationshipProperties,
} from "./graph-store/relationship-write";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import {
  linkOutgoingRelationship,
  unlinkOutgoingRelationship,
} from "./relationship-link-mutations";

export function createExtensionGraphMutateServices(
  ctx: TomeWriteContext,
): ExtensionGraphMutateServices {
  return {
    async linkOutgoing(input) {
      return linkOutgoingRelationship(ctx, {
        sourceId: input.sourceId,
        targetId: input.targetId,
        type: input.type,
        properties: input.properties as Properties | undefined,
      });
    },
    async unlinkOutgoing(sourceId, targetId, type) {
      return unlinkOutgoingRelationship(ctx, sourceId, targetId, type);
    },
    async replaceOutgoingProperties(sourceId, targetId, type, properties) {
      const replaced = await writeStoreReplaceRelationshipProperties(
        ctx.graphStore,
        sourceId,
        targetId,
        type,
        properties as Properties,
      );
      if (!replaced) return "not_found";
      await syncAfterRelationshipsWrite(ctx);
      return null;
    },
  };
}
