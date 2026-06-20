import { type ReactNode } from "react";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DragEndEvent } from "@dnd-kit/core";
import { ColumnHeaderMenu } from "./ColumnHeaderMenu";

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item!);
  return next;
}

interface ColumnHeaderManageProps {
  column: string;
  label: string;
  canManage?: boolean;
  isRelation?: boolean;
  onColumnEdit?: (column: string) => void;
  onColumnDelete?: (column: string) => void | Promise<void>;
}

function wrapManageableColumnHeader(
  {
    column,
    label,
    canManage,
    isRelation,
    onColumnEdit,
    onColumnDelete,
  }: ColumnHeaderManageProps,
  content: ReactNode,
  innerClassName?: string,
) {
  const inner = innerClassName ? <div className={innerClassName}>{content}</div> : content;

  if (!canManage || (!onColumnEdit && !onColumnDelete)) {
    return inner;
  }

  return (
    <ColumnHeaderMenu
      columnLabel={label}
      isRelation={isRelation}
      onEdit={onColumnEdit ? () => onColumnEdit(column) : undefined}
      onDelete={() => onColumnDelete?.(column)}
    >
      {inner}
    </ColumnHeaderMenu>
  );
}

interface ColumnHeaderCellContentProps extends ColumnHeaderManageProps {
  renderHeader: (column: string, label: string) => ReactNode;
  innerClassName?: string;
}

function ColumnHeaderCellContent({
  column,
  label,
  renderHeader,
  innerClassName,
  canManage,
  isRelation,
  onColumnEdit,
  onColumnDelete,
}: ColumnHeaderCellContentProps) {
  return wrapManageableColumnHeader(
    { column, label, canManage, isRelation, onColumnEdit, onColumnDelete },
    renderHeader(column, label),
    innerClassName,
  );
}

interface SortableColumnHeaderCellProps {
  column: string;
  label: string;
  renderHeader: (column: string, label: string) => ReactNode;
  canManage?: boolean;
  isRelation?: boolean;
  onColumnEdit?: (column: string) => void;
  onColumnDelete?: (column: string) => void | Promise<void>;
  useDragOverlay?: boolean;
  sortableId?: string;
}

function SortableColumnHeaderCell({
  column,
  label,
  renderHeader,
  canManage,
  isRelation,
  onColumnEdit,
  onColumnDelete,
  useDragOverlay = false,
  sortableId,
}: SortableColumnHeaderCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId ?? column,
  });

  const style =
    useDragOverlay && isDragging
      ? { opacity: 0.35 }
      : {
          transform: CSS.Transform.toString(transform),
          transition,
        };

  return (
    <th
      ref={setNodeRef}
      scope="col"
      style={style}
      className={`tome-column-header is-reorderable${isDragging ? " is-dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
      <ColumnHeaderCellContent
        column={column}
        label={label}
        renderHeader={renderHeader}
        innerClassName="tome-column-header-inner"
        canManage={canManage}
        isRelation={isRelation}
        onColumnEdit={onColumnEdit}
        onColumnDelete={onColumnDelete}
      />
    </th>
  );
}

export interface SortableDataColumnHeadersProps {
  columns: string[];
  columnLabels?: Record<string, string>;
  formatLabel: (column: string) => string;
  renderHeader: (column: string, label: string) => ReactNode;
  reorderable?: boolean;
  useDragOverlay?: boolean;
  /** Prefix for @dnd-kit sortable ids when the same column keys appear in multiple contexts. */
  sortableIdPrefix?: string;
  canManageColumn?: (column: string) => boolean;
  isRelationColumn?: (column: string) => boolean;
  onColumnEdit?: (column: string) => void;
  onColumnDelete?: (column: string) => void | Promise<void>;
}

export function SortableDataColumnHeaders({
  columns,
  columnLabels,
  formatLabel,
  renderHeader,
  reorderable = false,
  useDragOverlay = false,
  sortableIdPrefix,
  canManageColumn,
  isRelationColumn,
  onColumnEdit,
  onColumnDelete,
}: SortableDataColumnHeadersProps) {
  const labelFor = (column: string) => columnLabels?.[column] ?? formatLabel(column);
  const sortableIdFor = (column: string) =>
    sortableIdPrefix ? `${sortableIdPrefix}${column}` : column;
  const sortableItems = columns.map(sortableIdFor);

  if (!reorderable) {
    return (
      <>
        {columns.map((column) => (
          <th key={column} scope="col">
            <ColumnHeaderCellContent
              column={column}
              label={labelFor(column)}
              renderHeader={renderHeader}
              canManage={canManageColumn?.(column)}
              isRelation={isRelationColumn?.(column)}
              onColumnEdit={onColumnEdit}
              onColumnDelete={onColumnDelete}
            />
          </th>
        ))}
      </>
    );
  }

  return (
    <SortableContext items={sortableItems} strategy={horizontalListSortingStrategy}>
      {columns.map((column) => (
        <SortableColumnHeaderCell
          key={column}
          column={column}
          label={labelFor(column)}
          renderHeader={renderHeader}
          canManage={canManageColumn?.(column)}
          isRelation={isRelationColumn?.(column)}
          onColumnEdit={onColumnEdit}
          onColumnDelete={onColumnDelete}
          useDragOverlay={useDragOverlay}
          sortableId={sortableIdFor(column)}
        />
      ))}
    </SortableContext>
  );
}

export function columnLabelFor(
  column: string,
  columnLabels: Record<string, string> | undefined,
  formatLabel: (column: string) => string,
): string {
  return columnLabels?.[column] ?? formatLabel(column);
}

export function columnReorderOnDragEnd(
  event: DragEndEvent,
  columns: string[],
  onColumnsReorder: (nextColumns: string[]) => void | Promise<void>,
): void {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = columns.indexOf(String(active.id));
  const newIndex = columns.indexOf(String(over.id));
  if (oldIndex < 0 || newIndex < 0) return;

  void onColumnsReorder(moveItem(columns, oldIndex, newIndex));
}

export { moveItem as moveColumnOrderItem };
