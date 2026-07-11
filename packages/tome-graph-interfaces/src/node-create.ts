import type { Properties } from "./graph";

export type CreateNodeError = "invalid_title" | "source_not_found" | "database_not_found";

export type CreateNodeLink =
  | {
      kind: "outgoing";
      sourceId: string;
      type: string;
      properties?: Properties;
      /** When set, also create membership on the new node to this type table. */
      membershipTypeId?: string;
    }
  | { kind: "database-row"; databaseId: string; view?: string; properties?: Properties };

export interface CreateNodeInput {
  title: string;
  body?: string;
  link?: CreateNodeLink;
}

export interface CreateNodeResult {
  id: string;
  title: string;
}
