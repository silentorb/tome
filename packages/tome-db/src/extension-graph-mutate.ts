import type { ExtensionGraphMutateServices } from "tome-interfaces/extension-services/graph-mutate";
import type { TomeWriteContext } from "./content/write-context";
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
      });
    },
    unlinkOutgoing(sourceId, targetId, type) {
      return unlinkOutgoingRelationship(ctx, sourceId, targetId, type);
    },
  };
}
