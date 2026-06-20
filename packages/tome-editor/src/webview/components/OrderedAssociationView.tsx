import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  OrderedAssociationGroup,
  OrderedAssociationViewDetail,
} from "../../shared/types";
import type { EditorApi } from "../api/client";
import { isProtectedEditorNode } from "../../shared/types";
import { nodePageHref } from "../node-links";
import { filterRowsByName } from "../table-name-filter";
import { itemsTableSearchParamKey } from "../../shared/table-search-url";
import { useTableSearch } from "../hooks/useTableSearch";
import { RelationCellEditor } from "./RelationCellEditor";
import { TableRowActionsCell, type TableRowMoveConfig } from "./TableRowActionsCell";
import { renderTableCell } from "./table-cell-render";
import { TableSearchInput } from "./TableSearchInput";
import { TableUtilityBar } from "./TableUtilityBar";
import { ColumnEditorDialog, type ColumnEditorState } from "./ColumnEditorDialog";
import { SortableDataColumnHeaders, columnLabelFor, moveColumnOrderItem } from "./SortableDataColumnHeaders";
import "./ordered-association-view.css";
import "./section-data-table.css";

const ITEMS_SECTION_KEY = "items";

interface OrderedAssociationViewProps {
  api: EditorApi;
  nodeId: string;
  configId: string;
  view: OrderedAssociationViewDetail;
  onTabSelect: (tabId: string) => void;
  onViewChange: (view: OrderedAssociationViewDetail) => void;
  onCellUpdated?: () => void;
  onArchiveNode?: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

interface SortableOrderedRowProps {
  row: OrderedAssociationGroup["rows"][number];
  groupId: string;
  index: number;
  columns: string[];
  renderCell: (column: string, row: OrderedAssociationGroup["rows"][number]) => ReactNode;
  renderNameCell: (rowId: string, name: string) => ReactNode;
  rowPageActions?: {
    onArchiveNode: (nodeId: string) => Promise<void>;
    onRemoveNode: (nodeId: string) => Promise<void>;
    onDeleteNode: (nodeId: string) => Promise<void>;
    getMoveConfig?: (rowNodeId: string) => TableRowMoveConfig | undefined;
  };
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

function groupDropId(groupId: string): string {
  return `group:${groupId}`;
}

function resolveDropTarget(
  groups: OrderedAssociationGroup[],
  overId: string,
): { targetGroupId: string; targetIndex: number } | null {
  if (overId.startsWith("group:")) {
    const targetGroupId = overId.slice("group:".length);
    const group = groups.find((entry) => entry.groupId === targetGroupId);
    return { targetGroupId, targetIndex: group?.rows.length ?? 0 };
  }

  for (const group of groups) {
    const index = group.rows.findIndex((row) => row.sceneId === overId);
    if (index >= 0) {
      return { targetGroupId: group.groupId, targetIndex: index };
    }
  }

  return null;
}

function SortableOrderedRow({
  row,
  groupId,
  index,
  columns,
  renderCell,
  renderNameCell,
  rowPageActions,
  protectedNodeIds = [],
  archiveHubTitle,
}: SortableOrderedRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.sceneId,
    data: { groupId, index, type: "ordered-row" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={isDragging ? "is-dragging" : undefined}
      data-row-id={row.sceneId}
    >
      <td className="tome-ordered-association-drag-cell">
        <button
          type="button"
          className="tome-ordered-association-drag-handle"
          aria-label={`Reorder ${row.name}`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
      </td>
      {rowPageActions ? (
        <td className="tome-table-row-actions-col">
          {!isProtectedEditorNode(row.sceneId, protectedNodeIds) ? (
            <TableRowActionsCell
              recordTitle={row.name}
              archiveHubTitle={archiveHubTitle}
              onArchive={() => rowPageActions.onArchiveNode(row.sceneId)}
              onRemove={() => rowPageActions.onRemoveNode(row.sceneId)}
              onDelete={() => rowPageActions.onDeleteNode(row.sceneId)}
              move={rowPageActions.getMoveConfig?.(row.sceneId)}
            />
          ) : null}
        </td>
      ) : null}
      <th scope="row">{renderNameCell(row.sceneId, row.name)}</th>
      {columns.map((column) => (
        <td key={column}>{renderCell(column, row)}</td>
      ))}
    </tr>
  );
}

interface GroupTableProps {
  group: OrderedAssociationGroup;
  columns: string[];
  columnLabels: Record<string, string>;
  renderCell: (column: string, row: OrderedAssociationGroup["rows"][number]) => ReactNode;
  renderNameCell: (rowId: string, name: string) => ReactNode;
  rowPageActions?: {
    onArchiveNode: (nodeId: string) => Promise<void>;
    onRemoveNode: (nodeId: string) => Promise<void>;
    onDeleteNode: (nodeId: string) => Promise<void>;
    getMoveConfig?: (rowNodeId: string) => TableRowMoveConfig | undefined;
  };
  onColumnsReorder?: (nextColumns: string[]) => void | Promise<void>;
  canManageColumn?: (column: string) => boolean;
  isRelationColumn?: (column: string) => boolean;
  onColumnEdit?: (column: string) => void;
  onColumnDelete?: (column: string) => void | Promise<void>;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

function formatColumnLabel(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function columnSortablePrefix(groupId: string): string {
  return `col:${groupId}:`;
}

function GroupTable({
  group,
  columns,
  columnLabels,
  renderCell,
  renderNameCell,
  rowPageActions,
  onColumnsReorder,
  canManageColumn,
  isRelationColumn,
  onColumnEdit,
  onColumnDelete,
  protectedNodeIds,
  archiveHubTitle,
}: GroupTableProps) {
  const itemIds = useMemo(() => group.rows.map((row) => row.sceneId), [group.rows]);
  const { setNodeRef } = useDroppable({
    id: groupDropId(group.groupId),
    data: { groupId: group.groupId, type: "group" },
  });

  return (
    <section className="tome-ordered-association-group">
      <h3 className="tome-ordered-association-group-title">{group.title}</h3>
      <div className="tome-database-table-wrap">
        <table className="tome-database-table">
          <thead>
            <tr>
              <th scope="col" aria-label="Reorder" className="tome-ordered-association-drag-col" />
              {rowPageActions ? (
                <th scope="col" className="tome-table-row-actions-col" aria-label="Row actions" />
              ) : null}
              <th scope="col">Name</th>
              <SortableDataColumnHeaders
                columns={columns}
                columnLabels={columnLabels}
                formatLabel={formatColumnLabel}
                renderHeader={(_column, label) => label}
                reorderable={Boolean(onColumnsReorder)}
                useDragOverlay={Boolean(onColumnsReorder)}
                sortableIdPrefix={columnSortablePrefix(group.groupId)}
                canManageColumn={canManageColumn}
                isRelationColumn={isRelationColumn}
                onColumnEdit={onColumnEdit}
                onColumnDelete={onColumnDelete}
              />
            </tr>
          </thead>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <tbody ref={setNodeRef}>
              {group.rows.length === 0 ? (
                <tr className="tome-ordered-association-empty-row">
                  <td colSpan={columns.length + 2 + (rowPageActions ? 1 : 0)}>Drop rows here</td>
                </tr>
              ) : (
                group.rows.map((row, index) => (
                  <SortableOrderedRow
                    key={row.sceneId}
                    row={row}
                    groupId={group.groupId}
                    index={index}
                    columns={columns}
                    renderCell={renderCell}
                    renderNameCell={renderNameCell}
                    rowPageActions={rowPageActions}
                    protectedNodeIds={protectedNodeIds}
                    archiveHubTitle={archiveHubTitle}
                  />
                ))
              )}
            </tbody>
          </SortableContext>
        </table>
      </div>
    </section>
  );
}

export function OrderedAssociationView({
  api,
  nodeId,
  configId,
  view,
  onTabSelect,
  onViewChange,
  onCellUpdated,
  onArchiveNode,
  onDeleteNode,
  protectedNodeIds,
  archiveHubTitle,
}: OrderedAssociationViewProps) {
  const [searchQuery, setSearchQuery] = useTableSearch(itemsTableSearchParamKey());
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [displayColumns, setDisplayColumns] = useState(view.columns);
  const [columnEditorState, setColumnEditorState] = useState<ColumnEditorState | null>(null);

  useEffect(() => {
    setDisplayColumns(view.columns);
  }, [view.columns]);

  const handleColumnsReorder = useCallback(
    async (columnOrder: string[]) => {
      setDisplayColumns(columnOrder);
      await api.updateSectionColumnOrder(view.typeDatabaseId, ITEMS_SECTION_KEY, columnOrder);
      onCellUpdated?.();
    },
    [api, onCellUpdated, view.typeDatabaseId],
  );

  const canManageColumn = useCallback(
    (key: string) => {
      const def = view.columnDefs?.find((col) => col.key === key);
      return def != null && def.source !== "dynamic";
    },
    [view.columnDefs],
  );

  const isRelationColumn = useCallback(
    (key: string) => view.columnDefs?.find((col) => col.key === key)?.type === "relation",
    [view.columnDefs],
  );

  const handleColumnEdit = useCallback((key: string) => {
    setColumnEditorState({ mode: "edit", columnKey: key });
  }, []);

  const handleColumnDelete = useCallback(
    async (key: string) => {
      await api.deleteDatabaseColumn(view.typeDatabaseId, key);
      setDisplayColumns((current) => current.filter((column) => column !== key));
      onCellUpdated?.();
    },
    [api, onCellUpdated, view.typeDatabaseId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const columnLabels = useMemo(() => {
    if (!view.columnDefs?.length) return undefined;
    return Object.fromEntries(view.columnDefs.map((col) => [col.key, col.name]));
  }, [view.columnDefs]);

  const rowPageActions = useMemo(
    () =>
      onArchiveNode && onDeleteNode
        ? {
            onArchiveNode,
            onRemoveNode: async (rowId: string) => {
              await api.unlinkOutgoingRelationship(rowId, "is_a", view.typeDatabaseId);
              onCellUpdated?.();
            },
            onDeleteNode,
            getMoveConfig: (rowNodeId: string) => ({
              api,
              excludedIds: [nodeId, rowNodeId],
              onMove: async (selectedId: string) => {
                await api.moveRelationshipConnection({
                  type: "is_a",
                  oldSourceId: rowNodeId,
                  oldTargetId: view.typeDatabaseId,
                  newSourceId: rowNodeId,
                  newTargetId: selectedId,
                });
              },
              onMoved: onCellUpdated,
            }),
          }
        : undefined,
    [api, nodeId, onArchiveNode, onCellUpdated, onDeleteNode, view.typeDatabaseId],
  );

  const activeRow = useMemo(() => {
    if (!activeRowId) return null;
    for (const group of view.groups) {
      const row = group.rows.find((entry) => entry.sceneId === activeRowId);
      if (row) return row;
    }
    return null;
  }, [activeRowId, view.groups]);

  const renderNameCell = useCallback(
    (rowId: string, name: string) => (
      <a
        href={nodePageHref(rowId, window.location.href)}
        className="tome-database-name-link"
      >
        {name}
      </a>
    ),
    [],
  );

  const renderCell = useCallback(
    (column: string, row: OrderedAssociationGroup["rows"][number]) => {
      const def = view.columnDefs?.find((col) => col.key === column);
      const value = row.cells[column] ?? "";

      if (def?.type === "relation" && def.relationType) {
        const links = row.relationCells?.[column] ?? [];
        return (
          <RelationCellEditor
            api={api}
            links={links}
            columnName={def.name}
            allowedTypeIds={def.targetDatabaseId ? [def.targetDatabaseId] : undefined}
            onAdd={async (targetId) => {
              await api.linkOutgoingRelationship(row.sceneId, {
                type: def.relationType!,
                targetId,
              });
            }}
            onRemove={async (targetId) => {
              await api.unlinkOutgoingRelationship(row.sceneId, def.relationType!, targetId);
            }}
            onEditingComplete={onCellUpdated}
          />
        );
      }

      return renderTableCell({
        column,
        value,
        columnDef: def,
      });
    },
    [api, onCellUpdated, view.columnDefs, view.typeDatabaseId],
  );

  const handleRowDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveRowId(null);
      if (!over || active.id === over.id) return;

      const target = resolveDropTarget(view.groups, String(over.id));
      if (!target) return;

      setMoveError(null);
      setIsMoving(true);
      try {
        const nextView = await api.moveOrderedAssociation(configId, {
          scopeId: view.tabs.activeTabId,
          sceneId: String(active.id),
          targetGroupId: target.targetGroupId,
          targetIndex: target.targetIndex,
        });
        onViewChange(nextView);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsMoving(false);
      }
    },
    [api, configId, onViewChange, view.tabs.activeTabId, view.groups],
  );

  const handleColumnDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveColumnId(null);
      if (!over || active.id === over.id) return;

      const activeMatch = /^col:[^:]+:(.+)$/.exec(String(active.id));
      const overMatch = /^col:[^:]+:(.+)$/.exec(String(over.id));
      if (!activeMatch || !overMatch) return;

      const oldIndex = displayColumns.indexOf(activeMatch[1]!);
      const newIndex = displayColumns.indexOf(overMatch[1]!);
      if (oldIndex < 0 || newIndex < 0) return;

      void handleColumnsReorder(moveColumnOrderItem(displayColumns, oldIndex, newIndex));
    },
    [displayColumns, handleColumnsReorder],
  );

  const handleDragStart = useCallback((event: { active: { id: string | number } }) => {
    const activeId = String(event.active.id);
    const columnMatch = /^col:[^:]+:(.+)$/.exec(activeId);
    if (columnMatch) {
      setActiveColumnId(columnMatch[1]!);
      return;
    }
    setActiveRowId(activeId);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (String(event.active.id).startsWith("col:")) {
        handleColumnDragEnd(event);
        return;
      }
      void handleRowDragEnd(event);
    },
    [handleColumnDragEnd, handleRowDragEnd],
  );

  const handleDragCancel = useCallback(() => {
    setActiveRowId(null);
    setActiveColumnId(null);
  }, []);

  const filteredGroups = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return view.groups;
    return view.groups
      .map((group) => ({
        ...group,
        rows: filterRowsByName(group.rows, searchQuery, (row) => row.name),
      }))
      .filter((group) => group.rows.length > 0);
  }, [searchQuery, view.groups]);

  const totalRowCount = useMemo(
    () => view.groups.reduce((count, group) => count + group.rows.length, 0),
    [view.groups],
  );
  const hasActiveSearch = searchQuery.trim().length > 0;

  if (view.tabs.items.length === 0) {
    return <div className="tome-database-empty">No items in this database.</div>;
  }

  return (
    <div className={`tome-ordered-association-view${isMoving ? " is-moving" : ""}`}>
      <TableUtilityBar
        tabs={view.tabs}
        onTabSelect={onTabSelect}
        search={<TableSearchInput value={searchQuery} onChange={setSearchQuery} />}
        addColumn={
          <button
            type="button"
            className="tome-table-column-add"
            onClick={() => setColumnEditorState({ mode: "add" })}
          >
            + Column
          </button>
        }
      />

      {moveError ? <div className="tome-ordered-association-error">{moveError}</div> : null}

      {totalRowCount > 0 && hasActiveSearch && filteredGroups.length === 0 ? (
        <div className="tome-database-empty">No rows match “{searchQuery.trim()}”.</div>
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="tome-ordered-association-groups">
          {filteredGroups.map((group) => (
            <GroupTable
              key={group.groupId}
              group={group}
              columns={displayColumns}
              columnLabels={columnLabels ?? {}}
              renderCell={renderCell}
              renderNameCell={renderNameCell}
              rowPageActions={rowPageActions}
              onColumnsReorder={handleColumnsReorder}
              canManageColumn={canManageColumn}
              isRelationColumn={isRelationColumn}
              onColumnEdit={handleColumnEdit}
              onColumnDelete={handleColumnDelete}
              protectedNodeIds={protectedNodeIds}
              archiveHubTitle={archiveHubTitle}
            />
          ))}
        </div>

        <DragOverlay>
          {activeRow ? (
            <div className="tome-ordered-association-drag-overlay">{activeRow.name}</div>
          ) : activeColumnId ? (
            <div className="tome-column-drag-overlay">
              {columnLabelFor(activeColumnId, columnLabels, formatColumnLabel)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}
      <ColumnEditorDialog
        api={api}
        open={columnEditorState != null}
        databaseId={view.typeDatabaseId}
        state={columnEditorState}
        columnDefs={view.columnDefs}
        onClose={() => setColumnEditorState(null)}
        onSaved={() => onCellUpdated?.()}
      />
    </div>
  );
}
