import type { Properties } from "./graph";

export type CreateNodeError =
  | "invalid_title"
  | "source_not_found"
  | "database_not_found"
  | "corpus_not_found"
  | "corpus_readonly";

export type CreateNodeLink =
  | {
      kind: "outgoing";
      sourceId: string;
      type: string;
      properties?: Properties;
      /** When set, also link the new node into this type-table set (node id). */
      typeTableId?: string;
      /** Member-side perspective for the type-table link (required with typeTableId). */
      typeTablePerspective?: string;
    }
  | {
      kind: "database-row";
      databaseId: string;
      view?: string;
      properties?: Properties;
      /** Set-side or member-side perspective for the row edge; defaults from views. */
      perspective?: string;
      /** Extra edges from the new node after membership is created. */
      relations?: Array<{ type: string; targetId: string; properties?: Properties }>;
      /**
       * When stamping ordered membership `order`, only consider members that share
       * these relations (e.g. same Product scope).
       */
      orderScopeRelations?: Array<{ type: string; targetId: string }>;
    };

export interface CreateNodeInput {
  title: string;
  body?: string;
  link?: CreateNodeLink;
  /** Target corpus for the new node (defaults to primary / link-endpoint corpus). */
  corpusId?: string;
}

export interface CreateNodeResult {
  id: string;
  title: string;
}
