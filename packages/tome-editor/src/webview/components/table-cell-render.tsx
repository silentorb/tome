import type { ReactNode } from "react";
import type { DatabaseColumnDef } from "../../shared/types";
import { EnumSelectCell } from "./EnumSelectCell";

export interface RenderTableCellOptions {
  column: string;
  value: string;
  columnDef?: DatabaseColumnDef;
  onEnumChange?: (value: string) => void | Promise<void>;
}

export function renderTableCell({
  column,
  value,
  columnDef,
  onEnumChange,
}: RenderTableCellOptions): ReactNode {
  const def = columnDef ?? { key: column, name: column, type: "text" };

  if (def.type === "enum" && onEnumChange) {
    return <EnumSelectCell def={def} value={value} onChange={onEnumChange} />;
  }

  if (!value) return value;

  if (def.type === "checkbox") {
    return value === "true" ? "☑" : value === "false" ? "☐" : value;
  }

  if (
    def.type === "select" ||
    def.type === "status" ||
    def.type === "multi_select" ||
    def.type === "enum" ||
    def.type === "relation"
  ) {
    return <span className="tome-database-cell-badge">{value}</span>;
  }

  return value;
}
