/** Re-export store change types aligned with tome-service-interfaces. */
export type StoreChangeKind =
  | "node"
  | "relationships"
  | "associations"
  | "schema"
  | "dynamic-properties"
  | "views"
  | "workspace"
  | "table-presentation"
  | "sequencing"
  | "extensions"
  | "table-schemas"
  | "unknown";

export interface StoreChangeEvent {
  path: string;
  kind: StoreChangeKind;
}

export type StoreChangeListener = (event: StoreChangeEvent) => void;
