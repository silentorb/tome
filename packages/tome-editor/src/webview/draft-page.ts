import type { EditorNodePageDetail } from "tome-graph-interfaces";

/** Client-only id for New page drafts before createNode runs. */
export const DRAFT_NODE_ID = "__draft__";

export function isDraftNodeId(nodeId: string | null | undefined): boolean {
  return nodeId === DRAFT_NODE_ID;
}

export function makeDraftNodePageDetail(): EditorNodePageDetail {
  return {
    id: DRAFT_NODE_ID,
    title: "",
    primaryTypeTitle: null,
    isTypeTable: false,
    archived: false,
    document: { segments: [{ type: "prose", markdown: "" }] },
    metadata: {
      createdAt: null,
      modifiedAt: null,
      relationshipCount: 0,
      backlinks: [],
    },
    properties: null,
    sections: [{ type: "markdown" }],
  };
}
