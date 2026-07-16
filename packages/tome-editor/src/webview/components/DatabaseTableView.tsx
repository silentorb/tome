import { useCallback, useMemo, useState } from "react";
import type { EditorApi } from "../api/client";
import type { DatabaseViewDetail } from "../../shared/types";
import { databaseTableSortKey, viewSortsToTableSort } from "../../shared/user-settings";
import { nodePageHref } from "../node-links";
import { useTableSearch } from "../hooks/useTableSearch";
import { filterRowsByName } from "../table-name-filter";
import { itemsTableSearchParamKey } from "../../shared/table-search-url";
import { SectionDataTable, type SectionDataTableRow } from "./SectionDataTable";
import { TableAddRow, TableAddRowFooter, TableAddRowTrigger } from "./TableAddRowFooter";
import { RelationCellEditor } from "./RelationCellEditor";
import { renderTableCell } from "./table-cell-render";
import { TableSearchInput } from "./TableSearchInput";
import { TableUtilityBar } from "./TableUtilityBar";
import { ColumnVisibilityMenu } from "./ColumnVisibilityMenu";
import { ColumnEditorDialog, type ColumnEditorState } from "./ColumnEditorDialog";
import "./database-table-view.css";

interface DatabaseTableViewProps {
  api: EditorApi;
  nodeId: string;
  databaseView: DatabaseViewDetail;
  embedded?: boolean;
  onTabSelect: (tabId: string) => void;
  onTabsUpdated?: () => void;
  onCellUpdated?: () => void;
  onArchiveNode?: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

export function DatabaseTableView({
  api,
  nodeId,
  databaseView,
  embedded = false,
  onTabSelect,
  onTabsUpdated,
  onCellUpdated,
  onArchiveNode,
  onDeleteNode,
  protectedNodeIds,
  archiveHubTitle,
}: DatabaseTableViewProps) {
  const [searchQuery, setSearchQuery] = useTableSearch(itemsTableSearchParamKey());
  const [columnEditorState, setColumnEditorState] = useState<ColumnEditorState | null>(null);
  const tableKey = databaseTableSortKey(nodeId, databaseView.id, databaseView.tabs.activeTabId);

  const activeTabDefinition = useMemo(
    () =>
      databaseView.tabs.customDefinitions?.find(
        (definition) => definition.id === databaseView.tabs.activeTabId,
      ),
    [databaseView.tabs.activeTabId, databaseView.tabs.customDefinitions],
  );

  const visibleProperties = activeTabDefinition?.properties;
  const allColumns = databaseView.allColumns ?? databaseView.columns;
  const visibleColumns = databaseView.columns;

  const tabDefaultSort = useMemo(() => {
    return activeTabDefinition?.sorts?.length
      ? viewSortsToTableSort(activeTabDefinition.sorts)
      : undefined;
  }, [activeTabDefinition]);

  const columnLabels = useMemo(() => {
    const defs = databaseView.allColumnDefs ?? databaseView.columnDefs;
    if (!defs?.length) return undefined;
    return Object.fromEntries(defs.map((col) => [col.key, col.name]));
  }, [databaseView.allColumnDefs, databaseView.columnDefs]);

  const toggleColumnVisibility = useCallback(
    async (columnKey: string) => {
      const activeTabId = databaseView.tabs.activeTabId;
      if (!activeTabId) return;

      const currentVisible = visibleProperties?.length
        ? [...visibleProperties]
        : [...allColumns];
      const visibleSet = new Set(currentVisible);
      let next: string[];
      if (visibleSet.has(columnKey)) {
        next = currentVisible.filter((key) => key !== columnKey);
      } else {
        // Insert in default-order position among currently visible + this key
        next = allColumns.filter(
          (key) => key === columnKey || visibleSet.has(key),
        );
      }

      await api.updateRelationshipView(nodeId, databaseView.viewAssociation, activeTabId, {
        properties: next,
      });
      onTabsUpdated?.();
    },
    [
      api,
      allColumns,
      databaseView.tabs.activeTabId,
      databaseView.viewAssociation,
      nodeId,
      onTabsUpdated,
      visibleProperties,
    ],
  );

  const canManageColumn = useCallback(
    (key: string) => {
      const def = databaseView.columnDefs?.find((col) => col.key === key);
      return def != null && def.source !== "dynamic";
    },
    [databaseView.columnDefs],
  );

  const isRelationColumn = useCallback(
    (key: string) => databaseView.columnDefs?.find((col) => col.key === key)?.type === "relation",
    [databaseView.columnDefs],
  );

  const handleColumnEdit = useCallback((key: string) => {
    setColumnEditorState({ mode: "edit", columnKey: key });
  }, []);

  const handleColumnDelete = useCallback(
    async (key: string) => {
      await api.deleteDatabaseColumn(databaseView.id, key);
      onTabsUpdated?.();
    },
    [api, databaseView.id, onTabsUpdated],
  );

  const renderCell = useCallback(
    (column: string, value: string, row: SectionDataTableRow) => {
      const def = databaseView.columnDefs?.find((col) => col.key === column);
      const rowNodeId = row.id.split(":")[0]!;

      if (def?.type === "relation" && def.relationType) {
        const links = row.relationCells?.[column] ?? [];
        return (
          <RelationCellEditor
            api={api}
            links={links}
            columnName={def.name}
            allowedTypeIds={
              def.targetDatabaseId ? [def.targetDatabaseId] : undefined
            }
            onAdd={async (targetId) => {
              await api.linkOutgoingRelationship(rowNodeId, {
                type: def.relationType!,
                targetId,
              });
            }}
            onRemove={async (targetId) => {
              await api.unlinkOutgoingRelationship(
                rowNodeId,
                def.relationType!,
                targetId,
              );
            }}
            onEditingComplete={onCellUpdated}
          />
        );
      }

      return renderTableCell({
        column,
        value,
        columnDef: def,
        onEnumChange:
          def?.type === "enum"
            ? async (next) => {
                await api.updateDatabaseRowProperty(
                  databaseView.id,
                  rowNodeId,
                  column,
                  next,
                );
                onCellUpdated?.();
              }
            : undefined,
      });
    },
    [api, databaseView.columnDefs, databaseView.id, onCellUpdated],
  );

  const rows = useMemo(
    () =>
      databaseView.rows.map((row) => ({
        id: `${row.nodeId}:${row.rowIndex}`,
        name: row.name,
        cells: row.cells,
        relationCells: row.relationCells,
      })),
    [databaseView.rows],
  );

  const filteredRows = useMemo(
    () => filterRowsByName(rows, searchQuery, (row) => row.name),
    [rows, searchQuery],
  );

  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasRows = databaseView.rows.length > 0;
  const hasMatchingRows = filteredRows.length > 0;

  const renderNameCell = useCallback(
    (row: SectionDataTableRow) => {
      const rowNodeId = row.id.split(":")[0]!;
      return (
        <a
          href={nodePageHref(rowNodeId, window.location.href)}
          className="tome-database-name-link"
        >
          {row.name}
        </a>
      );
    },
    [],
  );

  const rowPageActions = useMemo(
    () =>
      onArchiveNode && onDeleteNode
        ? {
            onArchiveNode,
            onRemoveNode: async (rowNodeId: string) => {
              await api.unlinkOutgoingRelationship(
                rowNodeId,
                databaseView.memberSidePerspective,
                databaseView.id,
              );
              onCellUpdated?.();
            },
            onDeleteNode,
            getMoveConfig: (rowNodeId: string) => ({
              api,
              excludedIds: [nodeId, rowNodeId],
              onMove: async (selectedId: string) => {
                await api.moveRelationshipConnection({
                  type: databaseView.memberSidePerspective,
                  oldSourceId: rowNodeId,
                  oldTargetId: databaseView.id,
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
      databaseView.id,
      databaseView.memberSidePerspective,
      nodeId,
      onArchiveNode,
      onCellUpdated,
      onDeleteNode,
    ],
  );

  return (
    <TableAddRow
      label="New row"
      onSubmit={async (title) => {
        await api.createDatabaseRow(databaseView.id, {
          title,
          view: databaseView.view,
        });
        onCellUpdated?.();
      }}
    >
      <div className={`tome-database-view${embedded ? " is-embedded" : ""}`}>
        <header className="tome-database-header">
          {embedded ? null : (
            <div className="tome-database-heading">
              <h1 className="tome-database-title">{databaseView.title}</h1>
            </div>
          )}
          <TableUtilityBar
            tabs={databaseView.tabs}
            columnDefs={databaseView.columnDefs}
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
            columnVisibility={
              <ColumnVisibilityMenu
                columns={allColumns}
                columnLabels={columnLabels}
                visibleColumns={visibleColumns}
                onToggle={(columnKey) => {
                  void toggleColumnVisibility(columnKey);
                }}
              />
            }
            addRow={<TableAddRowTrigger />}
            onTabSelect={onTabSelect}
            onCreateTab={async (input) => {
              const view = await api.createRelationshipView(
                nodeId,
                databaseView.viewAssociation,
                input,
              );
              onTabSelect(view.id);
              onTabsUpdated?.();
            }}
            onUpdateTab={async (tabId, input) => {
              await api.updateRelationshipView(
                nodeId,
                databaseView.viewAssociation,
                tabId,
                input,
              );
              onTabsUpdated?.();
            }}
            onDeleteTab={async (tabId) => {
              await api.deleteRelationshipView(
                nodeId,
                databaseView.viewAssociation,
                tabId,
              );
              onTabsUpdated?.();
            }}
            onTabsReorder={async (tabOrder) => {
              await api.patchRelationshipViews(nodeId, databaseView.viewAssociation, {
                viewOrder: tabOrder,
              });
              onTabsUpdated?.();
            }}
          />
        </header>

        {!hasRows ? (
          <div className="tome-database-empty">No rows in this view.</div>
        ) : !hasMatchingRows && hasActiveSearch ? (
          <div className="tome-database-empty">No rows match “{searchQuery.trim()}”.</div>
        ) : (
          <SectionDataTable
            tableKey={tableKey}
            columns={databaseView.columns}
            rows={filteredRows}
            defaultSort={tabDefaultSort}
            renderNameCell={renderNameCell}
            columnLabels={columnLabels}
            renderCell={renderCell}
            rowPageActions={rowPageActions}
            onColumnsReorder={async (columnOrder) => {
              const activeTabId = databaseView.tabs.activeTabId;
              if (!activeTabId) return;
              await api.updateRelationshipView(
                nodeId,
                databaseView.viewAssociation,
                activeTabId,
                { properties: columnOrder },
              );
              onTabsUpdated?.();
            }}
            canManageColumn={canManageColumn}
            isRelationColumn={isRelationColumn}
            onColumnHide={(columnKey) => {
              void toggleColumnVisibility(columnKey);
            }}
            onColumnEdit={handleColumnEdit}
            onColumnDelete={handleColumnDelete}
            protectedNodeIds={protectedNodeIds}
            archiveHubTitle={archiveHubTitle}
          />
        )}
        <TableAddRowFooter />
      </div>
      <ColumnEditorDialog
        api={api}
        open={columnEditorState != null}
        databaseId={databaseView.id}
        viewId={databaseView.tabs.activeTabId}
        state={columnEditorState}
        columnDefs={databaseView.columnDefs}
        onClose={() => setColumnEditorState(null)}
        onSaved={() => onTabsUpdated?.()}
      />
    </TableAddRow>
  );
}
