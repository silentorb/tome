import { useCallback, useMemo } from "react";
import type { EditorApi } from "../api/client";
import type { RelationTableSection } from "../../shared/types";
import { relationTableSortKey } from "../../shared/user-settings";
import { nodePageHref } from "../node-links";
import { useTableSearch } from "../hooks/useTableSearch";
import { filterRowsByName } from "../table-name-filter";
import { relationTableSearchParamKey } from "../../shared/table-search-url";
import { SectionTitle } from "./NodeNameLink";
import { SectionDataTable, type SectionDataTableRow } from "./SectionDataTable";
import {
  TableLinkExistingRow,
  TableLinkExistingRowFooter,
  TableLinkExistingRowTrigger,
} from "./TableLinkExistingRow";
import { TableSearchInput } from "./TableSearchInput";
import { TableUtilityBar } from "./TableUtilityBar";
import { renderTableCell } from "./table-cell-render";
import "./relation-section-view.css";

interface RelationSectionViewProps {
  api: EditorApi;
  nodeId: string;
  section: RelationTableSection;
  onCellUpdated?: () => void;
  onArchiveNode?: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

export function RelationSectionView({
  api,
  nodeId,
  section,
  onCellUpdated,
  onArchiveNode,
  onDeleteNode,
  protectedNodeIds,
  archiveHubTitle,
}: RelationSectionViewProps) {
  const [searchQuery, setSearchQuery] = useTableSearch(relationTableSearchParamKey(section.label));
  const tableKey = relationTableSortKey(nodeId, section.label);

  const columnLabels = useMemo(() => {
    if (!section.columnDefs?.length) return undefined;
    return Object.fromEntries(section.columnDefs.map((col) => [col.key, col.name]));
  }, [section.columnDefs]);

  const renderCell = useCallback(
    (column: string, value: string, row: SectionDataTableRow) => {
      const def = section.columnDefs?.find((col) => col.key === column);
      return renderTableCell({
        column,
        value,
        columnDef: def,
        onEnumChange:
          def?.type === "enum"
            ? async (next) => {
                await api.updateOutgoingRelationshipProperty(
                  nodeId,
                  section.label,
                  row.id,
                  column,
                  next,
                );
                onCellUpdated?.();
              }
            : undefined,
      });
    },
    [api, onCellUpdated, nodeId, section.columnDefs, section.label],
  );

  const rows = useMemo(
    () =>
      section.rows.map((row) => ({
        id: row.targetId,
        name: row.name,
        cells: row.cells,
        targetId: row.targetId,
      })),
    [section.rows],
  );

  const filteredRows = useMemo(
    () => filterRowsByName(rows, searchQuery, (row) => row.name),
    [rows, searchQuery],
  );

  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasMatchingRows = filteredRows.length > 0;

  const renderNameCell = useCallback(
    (row: SectionDataTableRow) => {
      const targetId = row.id;
      return (
        <a
          href={nodePageHref(targetId, window.location.href)}
          className="tome-database-name-link"
        >
          {row.name}
        </a>
      );
    },
    [],
  );

  const linkLabel = `Link ${section.title.replace(/s$/i, "") || "record"}`;
  const allowedTypeIds =
    section.allowedTargetTypeIds ??
    (section.typeNodeId ? [section.typeNodeId] : undefined);
  const excludedIds = useMemo(
    () => [nodeId, ...section.rows.map((row) => row.targetId)],
    [nodeId, section.rows],
  );

  if (section.rows.length === 0) return null;

  const tableContent = (
    <section className="tome-record-section tome-relation-section">
      <SectionTitle api={api} title={section.title} typeNodeId={section.typeNodeId} />
      <TableUtilityBar
        search={<TableSearchInput value={searchQuery} onChange={setSearchQuery} />}
        addRow={
          section.addMode === "link-existing" ? <TableLinkExistingRowTrigger /> : undefined
        }
      />
      {!hasMatchingRows && hasActiveSearch ? (
        <div className="tome-database-empty">No rows match “{searchQuery.trim()}”.</div>
      ) : (
        <SectionDataTable
          tableKey={tableKey}
          columns={section.columns}
          rows={filteredRows}
          renderNameCell={renderNameCell}
          columnLabels={columnLabels}
          renderCell={renderCell}
          rowPageActions={
            onArchiveNode && onDeleteNode
              ? {
                  onArchiveNode,
                  onRemoveNode: async (targetId) => {
                    await api.unlinkOutgoingRelationship(nodeId, section.label, targetId);
                    onCellUpdated?.();
                  },
                  onDeleteNode,
                  getMoveConfig: (rowNodeId) => ({
                    api,
                    excludedIds: [nodeId, rowNodeId],
                    onMove: async (selectedId: string) => {
                      await api.moveRelationshipConnection({
                        type: section.label,
                        oldSourceId: nodeId,
                        oldTargetId: rowNodeId,
                        newSourceId: selectedId,
                        newTargetId: rowNodeId,
                      });
                    },
                    onMoved: onCellUpdated,
                  }),
                }
              : undefined
          }
          protectedNodeIds={protectedNodeIds}
          archiveHubTitle={archiveHubTitle}
        />
      )}
      {section.addMode === "link-existing" ? <TableLinkExistingRowFooter /> : null}
    </section>
  );

  if (section.addMode !== "link-existing") {
    return tableContent;
  }

  return (
    <TableLinkExistingRow
      label={linkLabel}
      api={api}
      allowedTypeIds={allowedTypeIds}
      excludedIds={excludedIds}
      onLink={async (targetId) => {
        await api.linkOutgoingRelationship(nodeId, {
          type: section.label,
          targetId,
        });
        onCellUpdated?.();
      }}
    >
      {tableContent}
    </TableLinkExistingRow>
  );
}
