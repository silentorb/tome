import type { DatabaseColumnDef } from "./database-view";

export interface PropertiesSection {
  type: "properties";
  databaseId: string;
  typeTitle: string;
  columns: string[];
  columnDefs?: DatabaseColumnDef[];
  cells: Record<string, string>;
}
