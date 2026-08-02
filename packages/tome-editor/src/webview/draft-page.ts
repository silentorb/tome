import type { NodePageDetail } from "../shared/types";

/** Client-only id for New page drafts before createNode runs. */
export const DRAFT_NODE_ID = "__draft__";

export function isDraftNodeId(nodeId: string | null | undefined): boolean {
  return nodeId === DRAFT_NODE_ID;
}

export function makeDraftNodePageDetail(): NodePageDetail {
  return {
    id: DRAFT_NODE_ID,
    title: "",
    body: "",
    primaryTypeTitle: null,
    isTypeTable: false,
    archived: false,
    metadata: {
      createdAt: null,
      modifiedAt: null,
      relationshipCount: 0,
      backlinks: [],
    },
    properties: null,
    sections: [{ type: "markdown", body: "" }],
  };
}
