export type GraphMutateLinkError =
  | "source_not_found"
  | "target_not_found"
  | "duplicate"
  | "target_type_not_allowed"
  | "unresolvable_type";

export type GraphMutateUnlinkError = "not_found";

export type GraphMutateReplacePropertiesError = "not_found";

export interface ExtensionGraphMutateServices {
  linkOutgoing(input: {
    sourceId: string;
    targetId: string;
    type: string;
    properties?: Record<string, unknown>;
  }): GraphMutateLinkError | null | Promise<GraphMutateLinkError | null>;
  unlinkOutgoing(
    sourceId: string,
    targetId: string,
    type: string,
  ): GraphMutateUnlinkError | null | Promise<GraphMutateUnlinkError | null>;
  replaceOutgoingProperties(
    sourceId: string,
    targetId: string,
    type: string,
    properties: Record<string, unknown>,
  ): GraphMutateReplacePropertiesError | null | Promise<GraphMutateReplacePropertiesError | null>;
}
