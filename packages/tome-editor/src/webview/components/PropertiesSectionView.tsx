import { useCallback } from "react";
import type { EditorApi } from "../api/client";
import type { PropertiesSection } from "../../shared/types";
import { SectionTitle } from "./NodeNameLink";
import { renderTableCell } from "./table-cell-render";
import "./properties-section-view.css";

interface PropertiesSectionViewProps {
  api: EditorApi;
  nodeId: string;
  section: PropertiesSection;
  onCellUpdated?: () => void;
}

export function PropertiesSectionView({
  api,
  nodeId,
  section,
  onCellUpdated,
}: PropertiesSectionViewProps) {
  const renderField = useCallback(
    (columnKey: string) => {
      const def = section.columnDefs?.find((col) => col.key === columnKey);
      const value = section.cells[columnKey] ?? "";
      const editable = def?.source !== "dynamic";

      return renderTableCell({
        column: columnKey,
        value,
        columnDef: def,
        onEnumChange:
          editable && def?.type === "enum"
            ? async (next) => {
                await api.updateDatabaseRowProperty(
                  section.databaseId,
                  nodeId,
                  columnKey,
                  next,
                );
                onCellUpdated?.();
              }
            : undefined,
      });
    },
    [api, onCellUpdated, nodeId, section.cells, section.columnDefs, section.databaseId],
  );

  return (
    <section className="tome-record-section tome-properties-section">
      <SectionTitle api={api} title="Properties" typeNodeId={section.databaseId} />
      <dl className="tome-properties-form">
        {section.columns.map((columnKey) => {
          const def = section.columnDefs?.find((col) => col.key === columnKey);
          const label = def?.name ?? columnKey;
          const isDynamic = def?.source === "dynamic";
          return (
            <div
              key={columnKey}
              className={`tome-properties-row${isDynamic ? " is-computed" : ""}`}
            >
              <dt className="tome-properties-label">
                {label}
                {isDynamic ? (
                  <span className="tome-properties-computed-hint"> (computed)</span>
                ) : null}
              </dt>
              <dd className="tome-properties-value">{renderField(columnKey)}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
