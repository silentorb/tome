import type { Properties } from "./graph";

export type CreateNodeError = "invalid_title" | "source_not_found" | "database_not_found";

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
    };

export interface CreateNodeInput {
  title: string;
  body?: string;
  link?: CreateNodeLink;
}

export interface CreateNodeResult {
  id: string;
  title: string;
}
