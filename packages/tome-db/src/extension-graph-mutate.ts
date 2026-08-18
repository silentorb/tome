import type { ExtensionGraphMutateServices } from "tome-interfaces/extension-services/graph-mutate";
import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import {
  linkOutgoingRelationship,
  unlinkOutgoingRelationship,
} from "./relationship-link-mutations";

export function createExtensionGraphMutateServices(
  ctx: TomeWriteContext,
): ExtensionGraphMutateServices {
  return {
    linkOutgoing(input) {
      return linkOutgoingRelationship(ctx, {
        sourceId: input.sourceId,
        targetId: input.targetId,
        type: input.type,
        properties: input.properties as Properties | undefined,
      });
    },
    unlinkOutgoing(sourceId, targetId, type) {
      return unlinkOutgoingRelationship(ctx, sourceId, targetId, type);
    },
    replaceOutgoingProperties(sourceId, targetId, type, properties) {
      const replaced = ctx.store.replaceRelationshipProperties(
        sourceId,
        targetId,
        type,
        properties as Properties,
      );
      if (!replaced) return "not_found";
      syncAfterRelationshipsWrite(ctx);
      return null;
    },
  };
}
