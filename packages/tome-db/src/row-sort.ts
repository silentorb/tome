import {
  compareEnumLabels,
  resolveEnumIdForPropertyName,
} from "./enum-codec";
import { loadWorkspaceSchema } from "./schema-rules/load";
import { resolvePropertyEnum } from "./property-enums";
import type { RelationLink } from "./relation-link";
import { isRelationColumnSort, relationLinkCount } from "./row-sort-helpers";

export { isRelationColumnSort, relationLinkCount } from "./row-sort-helpers";

export interface EvalRow {
  nodeId: string;
  name: string;
  cells: Record<string, string>;
  relationCells?: Record<string, RelationLink[]>;
  rowIndex: number;
  createdAt: string | null;
  modifiedAt: string | null;
}

function cellValue(row: EvalRow, propertyName: string): string | null {
  if (propertyName === "title") return row.name || null;
  const direct = row.cells[propertyName];
  if (direct !== undefined && direct !== "") return direct;
  const slug = propertyName.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  for (const [key, value] of Object.entries(row.cells)) {
    if (key.toLowerCase() === slug) return value;
  }
  return null;
}

function compareStrings(a: string | null, b: string | null): number {
  const left = a ?? "";
  const right = b ?? "";
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function compareNumbers(a: string | null, b: string | null): number {
  const na = a !== null ? Number.parseFloat(a) : NaN;
  const nb = b !== null ? Number.parseFloat(b) : NaN;
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return compareStrings(a, b);
}

export function sortEvalRows(rows: EvalRow[], sorts: unknown[]): EvalRow[] {
  if (!sorts.length) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    for (const sort of sorts) {
      if (!sort || typeof sort !== "object") continue;
      const s = sort as Record<string, unknown>;
      const direction = s.direction === "descending" ? -1 : 1;

      if (s.timestamp === "created_time") {
        const cmp = compareStrings(a.createdAt, b.createdAt) * direction;
        if (cmp !== 0) return cmp;
        continue;
      }
      if (s.timestamp === "last_edited_time") {
        const cmp = compareStrings(a.modifiedAt, b.modifiedAt) * direction;
        if (cmp !== 0) return cmp;
        continue;
      }

      const property = typeof s.property === "string" ? s.property : null;
      if (!property) continue;
      if (isRelationColumnSort(a, b, property)) {
        const cmp =
          (relationLinkCount(a, property) - relationLinkCount(b, property)) * direction;
        if (cmp !== 0) return cmp;
        continue;
      }
      const av = cellValue(a, property);
      const bv = cellValue(b, property);
      const schema = loadWorkspaceSchema();
      const enumId = resolveEnumIdForPropertyName(property, schema);
      const enumDef = enumId ? resolvePropertyEnum(enumId, schema) : null;
      const cmp = (
        enumDef
          ? compareEnumLabels(av, bv, enumDef)
          : compareNumbers(av, bv)
      ) * direction;
      if (cmp !== 0) return cmp;
    }
    if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return copy;
}
