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
import type { DatabaseRow, DatabaseRowGroup, DatabaseViewDetail, TableRowsQuery } from "tome-graph-interfaces";
import { UNASSIGNED_GROUP_ID } from "tome-graph-interfaces";
import type { EditorApi } from "../api/client";
import { isProtectedEditorNode } from "../../shared/types";
import { nodePageHref } from "../node-links";
import { itemsTableSearchParamKey } from "../../shared/table-search-url";
import { useTableSearch } from "../hooks/useTableSearch";
import { useWindowedTableRows } from "../hooks/useWindowedTableRows";
import { RelationCellEditor } from "./RelationCellEditor";
import { TableRowActionsCell, type TableRowMoveConfig } from "./TableRowActionsCell";
import { renderTableCell } from "./table-cell-render";
import { TableSearchInput } from "./TableSearchInput";
import { TableUtilityBar } from "./TableUtilityBar";
import { TableAddRow, TableAddRowFooter } from "./TableAddRowFooter";
import { ColumnEditorDialog, type ColumnEditorState } from "./ColumnEditorDialog";
import { SortableDataColumnHeaders, columnLabelFor, moveColumnOrderItem } from "./SortableDataColumnHeaders";
import { TableRowsSentinel } from "./TableRowsSentinel";
import "./grouped-database-view.css";
import "./section-data-table.css";

function mergeGroups(
  existing: DatabaseRowGroup[],
  incoming: DatabaseRowGroup[],
): DatabaseRowGroup[] {
  const byId = new Map<string, DatabaseRowGroup>();
  for (const group of existing) {
    byId.set(group.groupId, { ...group, rows: [...group.rows] });
  }
  for (const group of incoming) {
    const prior = byId.get(group.groupId);
    if (!prior) {
      byId.set(group.groupId, { ...group, rows: [...group.rows] });
      continue;
    }
    const seen = new Set(prior.rows.map((row) => row.nodeId));
    for (const row of group.rows) {
      if (!seen.has(row.nodeId)) prior.rows.push(row);
    }
  }
  const order: string[] = [];
  for (const group of existing) {
    if (!order.includes(group.groupId)) order.push(group.groupId);
  }
  for (const group of incoming) {
    if (!order.includes(group.groupId)) order.push(group.groupId);
  }
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

interface GroupedDatabaseViewProps {
  api: EditorApi;
  nodeId: string;
  view: DatabaseViewDetail;
  onTabSelect: (tabId: string) => void;
  onViewChange: (view: DatabaseViewDetail) => void;
  onCellUpdated?: () => void;
  onArchiveNode?: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

function groupDropId(groupId: string): string {
  return `group:${groupId}`;
}

function resolveDropTarget(
  groups: DatabaseRowGroup[],
  overId: string,
): { targetGroupId: string; targetIndex: number } | null {
  if (overId.startsWith("group:")) {
    const targetGroupId = overId.slice("group:".length);
    const group = groups.find((entry) => entry.groupId === targetGroupId);
    return { targetGroupId, targetIndex: group?.rows.length ?? 0 };
  }

  for (const group of groups) {
    const index = group.rows.findIndex((row) => row.nodeId === overId);
    if (index >= 0) {
      return { targetGroupId: group.groupId, targetIndex: index };
    }
  }

  return null;
}

function flattenGroupRows(groups: DatabaseRowGroup[]): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    for (const row of group.rows) ids.push(row.nodeId);
  }
  return ids;
}

function applyMoveToGroups(
  groups: DatabaseRowGroup[],
  memberId: string,
  targetGroupId: string,
  targetIndex: number,
): DatabaseRowGroup[] {
  const nextGroups = groups.map((group) => ({
    ...group,
    rows: [...group.rows],
  }));

  let movedRow: DatabaseRow | null = null;
  for (const group of nextGroups) {
    const index = group.rows.findIndex((row) => row.nodeId === memberId);
    if (index >= 0) {
      movedRow = group.rows.splice(index, 1)[0] ?? null;
      break;
    }
  }
  if (!movedRow) return groups;

  const targetGroup = nextGroups.find((group) => group.groupId === targetGroupId);
  if (!targetGroup) return groups;

  const safeIndex = Math.max(0, Math.min(targetIndex, targetGroup.rows.length));
  targetGroup.rows.splice(safeIndex, 0, movedRow);
  return nextGroups;
}

interface SortableGroupedProps {
  row: DatabaseRow;
  groupId: string;
  index: number;
  columns: string[];
  reorderable: boolean;
  renderCell: (column: string, row: DatabaseRow) => ReactNode;
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

function SortableGroupedRow({
  row,
  groupId,
  index,
  columns,
  reorderable,
  renderCell,
  renderNameCell,
  rowPageActions,
  protectedNodeIds = [],
  archiveHubTitle,
}: SortableGroupedProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.nodeId,
    data: { groupId, index, type: "ordered-row" },
    disabled: !reorderable,
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
      data-row-id={row.nodeId}
    >
      {reorderable ? (
        <td className="tome-grouped-database-drag-cell">
          <button
            type="button"
            className="tome-grouped-database-drag-handle"
            aria-label={`Reorder ${row.name}`}
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
        </td>
      ) : null}
      {rowPageActions ? (
        <td className="tome-table-row-actions-col">
          {!isProtectedEditorNode(row.nodeId, protectedNodeIds) ? (
            <TableRowActionsCell
              recordTitle={row.name}
              archiveHubTitle={archiveHubTitle}
              onArchive={() => rowPageActions.onArchiveNode(row.nodeId)}
              onRemove={() => rowPageActions.onRemoveNode(row.nodeId)}
              onDelete={() => rowPageActions.onDeleteNode(row.nodeId)}
              move={rowPageActions.getMoveConfig?.(row.nodeId)}
            />
          ) : null}
        </td>
      ) : null}
      <th scope="row">{renderNameCell(row.nodeId, row.name)}</th>
      {columns.map((column) => (
        <td key={column}>{renderCell(column, row)}</td>
      ))}
    </tr>
  );
}

function formatColumnLabel(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

interface GroupTableProps {
  group: DatabaseRowGroup;
  columns: string[];
  columnLabels: Record<string, string>;
  reorderable: boolean;
  renderCell: (column: string, row: DatabaseRow) => ReactNode;
  renderNameCell: (rowId: string, name: string) => ReactNode;
  onAddRow: (groupId: string, title: string) => Promise<void>;
  rowPageActions?: SortableGroupedProps["rowPageActions"];
  onColumnsReorder?: (nextColumns: string[]) => void | Promise<void>;
  canManageColumn?: (column: string) => boolean;
  isRelationColumn?: (column: string) => boolean;
  onColumnEdit?: (column: string) => void;
  onColumnDelete?: (column: string) => void | Promise<void>;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

function GroupTable({
  group,
  columns,
  columnLabels,
  reorderable,
  renderCell,
  renderNameCell,
  onAddRow,
  rowPageActions,
  onColumnsReorder,
  canManageColumn,
  isRelationColumn,
  onColumnEdit,
  onColumnDelete,
  protectedNodeIds,
  archiveHubTitle,
}: GroupTableProps) {
  const itemIds = useMemo(() => group.rows.map((row) => row.nodeId), [group.rows]);
  const { setNodeRef } = useDroppable({
    id: groupDropId(group.groupId),
    data: { groupId: group.groupId, type: "group" },
    disabled: !reorderable,
  });

  return (
    <TableAddRow label="New row" onSubmit={(title) => onAddRow(group.groupId, title)}>
      <section className="tome-grouped-database-group">
        <h3 className="tome-grouped-database-group-title">{group.title}</h3>
        <div className="tome-database-table-wrap">
          <table className="tome-database-table">
            <thead>
              <tr>
                {reorderable ? (
                  <th scope="col" aria-label="Reorder" className="tome-grouped-database-drag-col" />
                ) : null}
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
                  sortableIdPrefix={`col:${group.groupId}:`}
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
                  <tr className="tome-grouped-database-empty-row">
                    <td
                      colSpan={
                        columns.length + 1 + (reorderable ? 1 : 0) + (rowPageActions ? 1 : 0)
                      }
                    >
                      {reorderable ? "Drop rows here" : "No rows"}
                    </td>
                  </tr>
                ) : (
                  group.rows.map((row, index) => (
                    <SortableGroupedRow
                      key={row.nodeId}
                      row={row}
                      groupId={group.groupId}
                      index={index}
                      columns={columns}
                      reorderable={reorderable}
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
        <TableAddRowFooter />
      </section>
    </TableAddRow>
  );
}

export function GroupedDatabaseView({
  api,
  nodeId,
  view,
  onTabSelect,
  onViewChange,
  onCellUpdated,
  onArchiveNode,
  onDeleteNode,
  protectedNodeIds,
  archiveHubTitle,
}: GroupedDatabaseViewProps) {
  const [searchQuery, setSearchQuery] = useTableSearch(itemsTableSearchParamKey());
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [displayColumns, setDisplayColumns] = useState(view.columns);
  const [columnEditorState, setColumnEditorState] = useState<ColumnEditorState | null>(null);

  const seed = useMemo(
    () => ({
      rows: view.groups ?? [],
      rowsWindow: view.rowsWindow,
    }),
    [view.groups, view.rowsWindow],
  );

  const fetchPage = useCallback(
    async (query: TableRowsQuery) => {
      const next = await api.getDatabaseView(view.id, view.tabs.activeTabId, query);
      return { rows: next.groups ?? [], rowsWindow: next.rowsWindow };
    },
    [api, view.id, view.tabs.activeTabId],
  );

  const {
    rows: windowedGroups,
    rowsWindow,
    loadingMore,
    sentinelRef,
  } = useWindowedTableRows({
    seedKey: `${view.id}:${view.tabs.activeTabId}`,
    seed,
    q: searchQuery,
    fetchPage,
    mergeRows: mergeGroups,
  });

  useEffect(() => {
    setDisplayColumns(view.columns);
  }, [view.columns]);

  const reorderable = Boolean(view.presentation?.reorderable);
  const presentation = view.presentation;

  const handleColumnsReorder = useCallback(
    async (columnOrder: string[]) => {
      setDisplayColumns(columnOrder);
      await api.patchRelationshipViews(view.id, view.viewAssociation, {
        properties: columnOrder,
      });
      onCellUpdated?.();
    },
    [api, onCellUpdated, view.id, view.viewAssociation],
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const columnLabels = useMemo(() => {
    if (!view.columnDefs?.length) return {};
    return Object.fromEntries(view.columnDefs.map((col) => [col.key, col.name]));
  }, [view.columnDefs]);

  const rowPageActions = useMemo(
    () =>
      onArchiveNode && onDeleteNode
        ? {
            onArchiveNode,
            onRemoveNode: async (rowId: string) => {
              await api.unlinkOutgoingRelationship(
                rowId,
                view.memberSidePerspective,
                view.id,
              );
              onCellUpdated?.();
            },
            onDeleteNode,
            getMoveConfig: (rowNodeId: string) => ({
              api,
              excludedIds: [nodeId, rowNodeId],
              onMove: async (selectedId: string) => {
                await api.moveRelationshipConnection({
                  type: view.memberSidePerspective,
                  oldSourceId: rowNodeId,
                  oldTargetId: view.id,
                  newSourceId: rowNodeId,
                  newTargetId: selectedId,
                });
              },
              onMoved: onCellUpdated,
            }),
          }
        : undefined,
    [
      api,
      nodeId,
      onArchiveNode,
      onCellUpdated,
      onDeleteNode,
      view.memberSidePerspective,
      view.id,
    ],
  );

  const activeRow = useMemo(() => {
    if (!activeRowId) return null;
    for (const group of windowedGroups) {
      const row = group.rows.find((entry) => entry.nodeId === activeRowId);
      if (row) return row;
    }
    return null;
  }, [activeRowId, windowedGroups]);

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
    (column: string, row: DatabaseRow) => {
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
              await api.linkOutgoingRelationship(row.nodeId, {
                type: def.relationType!,
                targetId,
              });
            }}
            onRemove={async (targetId) => {
              await api.unlinkOutgoingRelationship(row.nodeId, def.relationType!, targetId);
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
    [api, onCellUpdated, view.columnDefs],
  );

  const handleAddRow = useCallback(
    async (groupId: string, title: string) => {
      const relations: Array<{ type: string; targetId: string }> = [];
      const orderScopeRelations: Array<{ type: string; targetId: string }> = [];
      if (presentation?.scopeRelationType && presentation.scopeId) {
        relations.push({
          type: presentation.scopeRelationType,
          targetId: presentation.scopeId,
        });
        orderScopeRelations.push({
          type: presentation.scopeRelationType,
          targetId: presentation.scopeId,
        });
      }
      if (
        presentation?.groupRelationType &&
        groupId !== UNASSIGNED_GROUP_ID
      ) {
        relations.push({
          type: presentation.groupRelationType,
          targetId: groupId,
        });
      }
      await api.createDatabaseRow(view.id, {
        title,
        view: view.view,
        relations,
        orderScopeRelations: orderScopeRelations.length ? orderScopeRelations : undefined,
      });
      const next = await api.getDatabaseView(view.id, view.tabs.activeTabId);
      onViewChange(next);
    },
    [api, onViewChange, presentation, view.id, view.tabs.activeTabId, view.view],
  );

  const handleRowDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveRowId(null);
      if (!over || active.id === over.id || !reorderable) return;

      const target = resolveDropTarget(windowedGroups, String(over.id));
      if (!target) return;

      const nextGroups = applyMoveToGroups(
        windowedGroups,
        String(active.id),
        target.targetGroupId,
        target.targetIndex,
      );

      setMoveError(null);
      setIsMoving(true);
      try {
        const nextView = await api.reorderDatabaseMembers(view.id, {
          orderedMemberIds: flattenGroupRows(nextGroups),
          tabId: view.tabs.activeTabId,
          groupChange: {
            memberId: String(active.id),
            targetGroupId: target.targetGroupId,
          },
        });
        onViewChange(nextView);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsMoving(false);
      }
    },
    [api, onViewChange, reorderable, view.id, view.tabs.activeTabId, windowedGroups],
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

  const loadedRowCount = useMemo(
    () => windowedGroups.reduce((count, group) => count + group.rows.length, 0),
    [windowedGroups],
  );
  const hasActiveSearch = searchQuery.trim().length > 0;

  if (view.tabs.items.length === 0) {
    return <div className="tome-database-empty">No items in this database.</div>;
  }

  return (
    <div className={`tome-grouped-database-view${isMoving ? " is-moving" : ""}`}>
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

      {moveError ? <div className="tome-grouped-database-error">{moveError}</div> : null}

      {hasActiveSearch && rowsWindow.total === 0 ? (
        <div className="tome-database-empty">No rows match “{searchQuery.trim()}”.</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="tome-grouped-database-groups">
            {windowedGroups.map((group) => (
              <GroupTable
                key={group.groupId}
                group={group}
                columns={displayColumns}
                columnLabels={columnLabels}
                reorderable={reorderable}
                renderCell={renderCell}
                renderNameCell={renderNameCell}
                onAddRow={handleAddRow}
                rowPageActions={rowPageActions}
                onColumnsReorder={handleColumnsReorder}
                canManageColumn={canManageColumn}
                isRelationColumn={isRelationColumn}
                onColumnEdit={(key) => setColumnEditorState({ mode: "edit", columnKey: key })}
                onColumnDelete={async (key) => {
                  await api.deleteDatabaseColumn(view.id, key);
                  setDisplayColumns((current) => current.filter((column) => column !== key));
                  onCellUpdated?.();
                }}
                protectedNodeIds={protectedNodeIds}
                archiveHubTitle={archiveHubTitle}
              />
            ))}
          </div>

          <DragOverlay>
            {activeRow ? (
              <div className="tome-grouped-database-drag-overlay">{activeRow.name}</div>
            ) : activeColumnId ? (
              <div className="tome-column-drag-overlay">
                {columnLabelFor(activeColumnId, columnLabels, formatColumnLabel)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <TableRowsSentinel
        sentinelRef={sentinelRef}
        hasMore={rowsWindow.hasMore}
        loadingMore={loadingMore}
        total={rowsWindow.total}
        loaded={loadedRowCount}
      />
      <ColumnEditorDialog
        api={api}
        open={columnEditorState != null}
        databaseId={view.id}
        state={columnEditorState}
        columnDefs={view.columnDefs}
        onClose={() => setColumnEditorState(null)}
        onSaved={() => onCellUpdated?.()}
      />
    </div>
  );
}
