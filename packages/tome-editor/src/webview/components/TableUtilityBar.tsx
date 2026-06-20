import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DatabaseColumnDef, TableTabsDetail, ViewSortSpec } from "../../shared/types";
import { moveColumnOrderItem } from "./SortableDataColumnHeaders";
import { TabEditor } from "./TabEditor";
import "./table-utility-bar.css";

const DRAFT_TAB_ID = "__draft__";

interface DraftTab {
  name: string;
  sorts: ViewSortSpec[];
}

interface TableTabItem {
  id: string;
  label: string;
  kind: "custom" | "generated";
}

interface TableUtilityBarProps {
  tabs?: TableTabsDetail;
  search?: ReactNode;
  addRow?: ReactNode;
  addColumn?: ReactNode;
  columnDefs?: DatabaseColumnDef[];
  onTabSelect?: (tabId: string) => void;
  onCreateTab?: (input: { name: string; sorts?: ViewSortSpec[] }) => Promise<void>;
  onUpdateTab?: (
    tabId: string,
    input: { name?: string; sorts?: ViewSortSpec[] },
  ) => Promise<void>;
  onDeleteTab?: (tabId: string) => Promise<void>;
  onTabsReorder?: (tabIds: string[]) => Promise<void>;
}

interface SortableTabButtonProps {
  tab: TableTabItem;
  isActive: boolean;
  isEditing: boolean;
  isDraft: boolean;
  reorderable: boolean;
  onClick: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}

function SortableTabButton({
  tab,
  isActive,
  isEditing,
  isDraft,
  reorderable,
  onClick,
  onContextMenu,
}: SortableTabButtonProps) {
  const sortable = reorderable && !isDraft;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    disabled: !sortable,
  });

  const style = sortable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined;

  return (
    <div
      ref={sortable ? setNodeRef : undefined}
      style={style}
      className={`tome-table-tab-wrap${isDragging ? " is-dragging" : ""}`}
    >
      <button
        type="button"
        aria-selected={isActive}
        className={`tome-database-view-tab${isActive ? " is-active" : ""}${isEditing ? " is-editing" : ""}${isDraft ? " is-draft" : ""}${sortable ? " is-reorderable" : ""}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
        {...(sortable ? { ...attributes, ...listeners } : {})}
        role="tab"
      >
        {tab.label}
      </button>
    </div>
  );
}

function tabReorderOnDragEnd(
  event: DragEndEvent,
  tabIds: string[],
  onTabsReorder: (nextTabIds: string[]) => void | Promise<void>,
): void {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = tabIds.indexOf(String(active.id));
  const newIndex = tabIds.indexOf(String(over.id));
  if (oldIndex < 0 || newIndex < 0) return;

  void onTabsReorder(moveColumnOrderItem(tabIds, oldIndex, newIndex));
}

export function TableUtilityBar({
  tabs,
  search,
  addRow,
  addColumn,
  columnDefs,
  onTabSelect,
  onCreateTab,
  onUpdateTab,
  onDeleteTab,
  onTabsReorder,
}: TableUtilityBarProps) {
  const editable =
    tabs?.kind === "custom" && Boolean(onCreateTab && onUpdateTab && onDeleteTab);
  const reorderable = editable && Boolean(onTabsReorder);
  const [editorTabId, setEditorTabId] = useState<string | null>(null);
  const [draftTab, setDraftTab] = useState<DraftTab | null>(null);
  const [pendingTabId, setPendingTabId] = useState<string | null>(null);
  const [displayTabItems, setDisplayTabItems] = useState(tabs?.items ?? []);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragCompletedRef = useRef(false);

  useEffect(() => {
    setDisplayTabItems(tabs?.items ?? []);
  }, [tabs?.items]);

  useEffect(() => {
    setPendingTabId(null);
  }, [tabs?.activeTabId]);

  const discardDraft = () => {
    setEditorTabId(null);
    setDraftTab(null);
  };

  useEffect(() => {
    if (!editorTabId && !draftTab) return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        discardDraft();
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [editorTabId, draftTab]);

  const handleTabsReorder = useCallback(
    async (nextTabIds: string[]) => {
      const nextItems = nextTabIds
        .map((id) => displayTabItems.find((tab) => tab.id === id))
        .filter((tab): tab is TableTabItem => tab !== undefined);
      setDisplayTabItems(nextItems);
      dragCompletedRef.current = true;
      if (onTabsReorder) {
        await onTabsReorder(nextTabIds);
      }
    },
    [displayTabItems, onTabsReorder],
  );

  const tabDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const showTabs =
    tabs != null &&
    (displayTabItems.length > 1 || editable || draftTab != null) &&
    (displayTabItems.length > 0 || draftTab != null);

  if (!showTabs && !search && !addRow && !addColumn) return null;

  const definitionFor = (tabId: string) =>
    tabs?.customDefinitions?.find((definition) => definition.id === tabId);

  const tabLabel = (tabId: string) => {
    if (tabId === DRAFT_TAB_ID) return draftTab?.name ?? "New tab";
    return displayTabItems.find((tab) => tab.id === tabId)?.label ?? "";
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      discardDraft();
    }
  };

  const displayItems: TableTabItem[] = draftTab
    ? [
        ...displayTabItems,
        { id: DRAFT_TAB_ID, label: draftTab.name, kind: "custom" as const },
      ]
    : displayTabItems;

  const sortableTabIds = displayTabItems.map((tab) => tab.id);

  const displayActiveTabId = draftTab
    ? DRAFT_TAB_ID
    : (pendingTabId ?? tabs?.activeTabId ?? "");

  const editingTab =
    editorTabId === DRAFT_TAB_ID && draftTab
      ? { id: DRAFT_TAB_ID, name: draftTab.name, sorts: draftTab.sorts }
      : editorTabId
        ? definitionFor(editorTabId)
        : null;

  const startDraftTab = () => {
    setDraftTab({
      name: "New tab",
      sorts: [{ column: "name", direction: "asc" }],
    });
    setEditorTabId(DRAFT_TAB_ID);
  };

  const handleTabClick = (tab: TableTabItem) => {
    if (dragCompletedRef.current) {
      dragCompletedRef.current = false;
      return;
    }
    if (tab.id === DRAFT_TAB_ID) {
      setEditorTabId((current) => (current === DRAFT_TAB_ID ? null : DRAFT_TAB_ID));
      return;
    }
    if (editable && tab.id === displayActiveTabId && !draftTab && tab.id !== DRAFT_TAB_ID) {
      setEditorTabId((current) => (current === tab.id ? null : tab.id));
      return;
    }
    discardDraft();
    setPendingTabId(tab.id);
    onTabSelect?.(tab.id);
  };

  const tabList = showTabs ? (
    <div className="tome-database-view-tabs" role="tablist" aria-label="Table views">
      {reorderable ? (
        <SortableContext items={sortableTabIds} strategy={horizontalListSortingStrategy}>
          {displayItems.map((tab) => (
            <SortableTabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === displayActiveTabId}
              isEditing={editorTabId === tab.id}
              isDraft={tab.id === DRAFT_TAB_ID}
              reorderable={reorderable}
              onClick={() => handleTabClick(tab)}
              onContextMenu={
                editable && tab.id !== DRAFT_TAB_ID
                  ? (event) => {
                      event.preventDefault();
                      setDraftTab(null);
                      setEditorTabId(tab.id);
                    }
                  : undefined
              }
            />
          ))}
        </SortableContext>
      ) : (
        displayItems.map((tab) => (
          <SortableTabButton
            key={tab.id}
            tab={tab}
            isActive={tab.id === displayActiveTabId}
            isEditing={editorTabId === tab.id}
            isDraft={tab.id === DRAFT_TAB_ID}
            reorderable={false}
            onClick={() => handleTabClick(tab)}
            onContextMenu={
              editable && tab.id !== DRAFT_TAB_ID
                ? (event) => {
                    event.preventDefault();
                    setDraftTab(null);
                    setEditorTabId(tab.id);
                  }
                : undefined
            }
          />
        ))
      )}
      {editable ? (
        <button
          type="button"
          className="tome-table-tab-add"
          aria-label="Add tab"
          disabled={busy || draftTab !== null}
          onClick={startDraftTab}
        >
          +
        </button>
      ) : null}
    </div>
  ) : null;

  const tabsContent =
    showTabs && tabList ?
      reorderable ?
        <DndContext
          sensors={tabDragSensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => tabReorderOnDragEnd(event, sortableTabIds, handleTabsReorder)}
        >
          {tabList}
        </DndContext>
      : tabList
    : null;

  return (
    <div className="tome-table-utility-bar" ref={rootRef}>
      <div className="tome-table-utility-row">
        {tabsContent ? <div className="tome-table-utility-tabs">{tabsContent}</div> : null}
        {search || addRow || addColumn ? (
          <div className="tome-table-utility-actions">
            {search}
            {addColumn}
            {addRow}
          </div>
        ) : null}
      </div>

      {editable && editingTab ? (
        <TabEditor
          key={editingTab.id}
          initialName={tabLabel(editingTab.id)}
          initialSorts={editingTab.sorts}
          columnDefs={columnDefs}
          canDelete={editorTabId !== DRAFT_TAB_ID && displayTabItems.length > 1}
          busy={busy}
          onCancel={discardDraft}
          onSave={({ name, sorts }) => {
            if (editorTabId === DRAFT_TAB_ID) {
              void run(async () => {
                await onCreateTab!({ name, sorts });
              });
              return;
            }
            void run(async () => {
              await onUpdateTab!(editingTab.id, { name, sorts });
            });
          }}
          onDelete={() => {
            if (editorTabId === DRAFT_TAB_ID) {
              discardDraft();
              return;
            }
            void run(async () => {
              await onDeleteTab!(editingTab.id);
            });
          }}
        />
      ) : null}
    </div>
  );
}
