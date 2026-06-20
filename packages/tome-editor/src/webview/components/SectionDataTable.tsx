import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { RelationLink } from "../../shared/types";
import { isProtectedEditorNode } from "../../shared/types";
import {
  sortTableRows,
  type SortableTableRow,
  type TableSortSpec,
} from "../../shared/user-settings";
import { useUserSettings } from "../hooks/useUserSettings";
import {
  SortableDataColumnHeaders,
  columnLabelFor,
  columnReorderOnDragEnd,
} from "./SortableDataColumnHeaders";
import { TableRowActionsCell, type TableRowMoveConfig } from "./TableRowActionsCell";
import "./section-data-table.css";
import "./page-actions-menu.css";

export interface SectionDataTableRow extends SortableTableRow {
  relationCells?: Record<string, RelationLink[]>;
}

interface TableRowPageActions {
  onArchiveNode: (nodeId: string) => Promise<void>;
  onRemoveNode: (nodeId: string) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  getMoveConfig?: (rowNodeId: string) => TableRowMoveConfig | undefined;
}

interface SectionDataTableProps {
  tableKey: string;
  columns: string[];
  rows: SectionDataTableRow[];
  renderNameCell: (row: SectionDataTableRow) => ReactNode;
  sortable?: boolean;
  /** Tab or section default when the user has not overridden sort for `tableKey`. */
  defaultSort?: TableSortSpec;
  columnLabels?: Record<string, string>;
  renderCell?: (column: string, value: string, row: SectionDataTableRow) => ReactNode;
  rowPageActions?: TableRowPageActions;
  onColumnsReorder?: (nextColumns: string[]) => void | Promise<void>;
  canManageColumn?: (column: string) => boolean;
  isRelationColumn?: (column: string) => boolean;
  onColumnEdit?: (column: string) => void;
  onColumnDelete?: (column: string) => void | Promise<void>;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

function rowNodeId(row: SectionDataTableRow): string {
  const colon = row.id.indexOf(":");
  return colon >= 0 ? row.id.slice(0, colon) : row.id;
}

function formatColumnLabel(key: string): string {
  if (key === "name") return "Name";
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sortIndicator(direction: "asc" | "desc"): string {
  return direction === "asc" ? "▲" : "▼";
}

export function SectionDataTable({
  tableKey,
  columns,
  rows,
  renderNameCell,
  sortable = true,
  defaultSort,
  columnLabels,
  renderCell,
  rowPageActions,
  onColumnsReorder,
  canManageColumn,
  isRelationColumn,
  onColumnEdit,
  onColumnDelete,
  protectedNodeIds = [],
  archiveHubTitle,
}: SectionDataTableProps) {
  const { getTableSort, hasTableSortOverride, toggleTableSortColumn, schema } = useUserSettings();
  const [displayColumns, setDisplayColumns] = useState(columns);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

  useEffect(() => {
    setDisplayColumns(columns);
  }, [columns]);

  const sortSpec = getTableSort(tableKey, defaultSort);
  const useServerRowOrder =
    sortable && defaultSort !== undefined && !hasTableSortOverride(tableKey);
  const sortedRows = useMemo(
    () => (sortable && !useServerRowOrder ? sortTableRows(rows, sortSpec, schema) : rows),
    [rows, sortSpec, schema, sortable, useServerRowOrder],
  );
  const primarySort = sortable ? sortSpec.orderBy[0] : undefined;

  const handleColumnsReorder = useCallback(
    async (nextColumns: string[]) => {
      setDisplayColumns(nextColumns);
      if (onColumnsReorder) {
        await onColumnsReorder(nextColumns);
      }
    },
    [onColumnsReorder],
  );

  const renderHeaderCell = useCallback(
    (column: string, label: string) => {
      if (!sortable) {
        return <span>{label}</span>;
      }

      return (
        <button
          type="button"
          className={`tome-table-sort-button${primarySort?.column === column ? " is-active" : ""}`}
          aria-sort={
            primarySort?.column === column
              ? primarySort.direction === "asc"
                ? "ascending"
                : "descending"
              : "none"
          }
          onClick={() => toggleTableSortColumn(tableKey, column, defaultSort)}
        >
          <span>{label}</span>
          {primarySort?.column === column ? (
            <span className="tome-table-sort-indicator" aria-hidden="true">
              {sortIndicator(primarySort.direction)}
            </span>
          ) : null}
        </button>
      );
    },
    [defaultSort, primarySort, sortable, tableKey, toggleTableSortColumn],
  );

  const columnDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const tableMarkup = (
    <table className="tome-database-table">
      <thead>
        <tr>
          {rowPageActions ? (
            <th scope="col" className="tome-table-row-actions-col" aria-label="Row actions" />
          ) : null}
            <th scope="col">
              {renderHeaderCell("name", formatColumnLabel("name"))}
            </th>
          <SortableDataColumnHeaders
            columns={displayColumns}
            columnLabels={columnLabels}
            formatLabel={formatColumnLabel}
            renderHeader={renderHeaderCell}
            reorderable={Boolean(onColumnsReorder)}
            useDragOverlay={Boolean(onColumnsReorder)}
            canManageColumn={canManageColumn}
            isRelationColumn={isRelationColumn}
            onColumnEdit={onColumnEdit}
            onColumnDelete={onColumnDelete}
          />
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => {
          const nodeId = rowNodeId(row);
          const showRowActions =
            rowPageActions !== undefined && !isProtectedEditorNode(nodeId, protectedNodeIds);

          return (
            <tr key={row.id}>
              {rowPageActions ? (
                <td className="tome-table-row-actions-col">
                  {showRowActions ? (
                    <TableRowActionsCell
                      recordTitle={row.name}
                      archiveHubTitle={archiveHubTitle}
                      onArchive={() => rowPageActions.onArchiveNode(nodeId)}
                      onRemove={() => rowPageActions.onRemoveNode(nodeId)}
                      onDelete={() => rowPageActions.onDeleteNode(nodeId)}
                      move={rowPageActions.getMoveConfig?.(nodeId)}
                    />
                  ) : null}
                </td>
              ) : null}
              <th scope="row">{renderNameCell(row)}</th>
              {displayColumns.map((column) => (
                <td key={column}>
                  {renderCell
                    ? renderCell(column, row.cells[column] ?? "", row)
                    : (row.cells[column] ?? "")}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="tome-database-table-wrap">
      {onColumnsReorder ? (
        <DndContext
          sensors={columnDragSensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveColumnId(String(event.active.id))}
          onDragEnd={(event) => {
            columnReorderOnDragEnd(event, displayColumns, handleColumnsReorder);
            setActiveColumnId(null);
          }}
          onDragCancel={() => setActiveColumnId(null)}
        >
          {tableMarkup}
          <DragOverlay>
            {activeColumnId ? (
              <div className="tome-column-drag-overlay">
                {columnLabelFor(activeColumnId, columnLabels, formatColumnLabel)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        tableMarkup
      )}
    </div>
  );
}
