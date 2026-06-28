import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WorkspaceQuickLink } from "tome-db";
import type { AppView } from "../../shared/types";
import { isProtectedEditorNode } from "../../shared/types";
import type { EditorApi } from "../api/client";
import type { SidePanelStandaloneUrls } from "./SidePanel";
import { nodePageHref } from "../node-links";
import {
  navigateQuickLinkKeyboard,
  navigateQuickLinkPointerUp,
  type QuickLinkDragState,
} from "../quick-links-nav";
import { moveColumnOrderItem } from "./SortableDataColumnHeaders";
import { AddRelationshipDialog } from "./AddRelationshipDialog";
import { PageActionsMenu } from "./PageActionsMenu";
import "./page-actions-menu.css";

interface QuickLinksPanelProps {
  api: EditorApi;
  quickLinks: readonly WorkspaceQuickLink[];
  activeView: AppView;
  activeNodeId?: string | null;
  activeNodeArchived?: boolean;
  collapsed: boolean;
  standaloneUrls?: SidePanelStandaloneUrls;
  pageBase?: string;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
  onRemoveQuickLink?: (nodeId: string) => void | Promise<void>;
  onQuickLinksReorder?: (nodeIds: string[]) => void | Promise<void>;
  onArchiveNode?: (nodeId: string) => Promise<void>;
  onUnarchiveNode?: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
}

interface SortableQuickLinkItemProps {
  link: WorkspaceQuickLink;
  active: boolean;
  archived: boolean;
  collapsed: boolean;
  href: string;
  reorderable: boolean;
  pageBase?: string;
  dragState?: QuickLinkDragState;
  showActions: boolean;
  archiveHubTitle?: string;
  onRelate: () => void;
  onRemoveQuickLink?: (nodeId: string) => void | Promise<void>;
  onArchiveNode?: (nodeId: string) => Promise<void>;
  onUnarchiveNode?: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
}

function quickLinksReorderOnDragEnd(
  event: DragEndEvent,
  nodeIds: string[],
  onQuickLinksReorder: (nextNodeIds: string[]) => void | Promise<void>,
): void {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const oldIndex = nodeIds.indexOf(String(active.id));
  const newIndex = nodeIds.indexOf(String(over.id));
  if (oldIndex < 0 || newIndex < 0) return;

  void onQuickLinksReorder(moveColumnOrderItem(nodeIds, oldIndex, newIndex));
}

function swallowSyntheticClick(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

function SortableQuickLinkItem({
  link,
  active,
  archived,
  collapsed,
  href,
  reorderable,
  pageBase,
  dragState,
  showActions,
  archiveHubTitle,
  onRelate,
  onRemoveQuickLink,
  onArchiveNode,
  onUnarchiveNode,
  onDeleteNode,
}: SortableQuickLinkItemProps) {
  const { nodeId, label, icon } = link;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: nodeId,
    disabled: !reorderable,
  });

  const style = reorderable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined;

  const itemClassName = `tome-side-panel-item${reorderable ? " is-reorderable" : ""}`;
  const itemContent = (
    <>
      <span className="tome-side-panel-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tome-side-panel-item-label">{label}</span>
    </>
  );

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!reorderable || !dragState) return;
    const wasDrag = dragState.didDrag;
    navigateQuickLinkPointerUp(event.nativeEvent, nodeId, pageBase, dragState);
    if (wasDrag) {
      event.currentTarget.blur();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!reorderable) return;
    navigateQuickLinkKeyboard(event, nodeId, pageBase);
  };

  return (
    <div
      ref={reorderable ? setNodeRef : undefined}
      style={style}
      className={`tome-side-panel-quick-link-item${active ? " is-active" : ""}${isDragging ? " is-dragging" : ""}`}
    >
      {reorderable ? (
        <button
          type="button"
          className={itemClassName}
          title={label}
          {...attributes}
          {...listeners}
          onPointerUp={handlePointerUp}
          onClick={swallowSyntheticClick}
          onAuxClick={swallowSyntheticClick}
          onKeyDown={handleKeyDown}
        >
          {itemContent}
        </button>
      ) : (
        <a className={itemClassName} href={href} title={label}>
          {itemContent}
        </a>
      )}
      {!collapsed && showActions && onArchiveNode && onDeleteNode && onRemoveQuickLink ? (
        <div className="tome-side-panel-quick-link-actions">
          <PageActionsMenu
            recordTitle={label}
            archived={archived}
            trigger="vertical-dots"
            menuAlign="right"
            menuPlacement="portal"
            archiveHubTitle={archiveHubTitle}
            onRelate={onRelate}
            isQuickLink
            onRemoveQuickLink={() => onRemoveQuickLink(nodeId)}
            onArchive={() => onArchiveNode(nodeId)}
            onUnarchive={onUnarchiveNode ? () => onUnarchiveNode(nodeId) : undefined}
            onDelete={() => onDeleteNode(nodeId)}
          />
        </div>
      ) : null}
    </div>
  );
}

export function QuickLinksPanel({
  api,
  quickLinks,
  activeView,
  activeNodeId,
  activeNodeArchived = false,
  collapsed,
  standaloneUrls,
  pageBase,
  protectedNodeIds = [],
  archiveHubTitle,
  onRemoveQuickLink,
  onQuickLinksReorder,
  onArchiveNode,
  onUnarchiveNode,
  onDeleteNode,
}: QuickLinksPanelProps) {
  const [displayLinks, setDisplayLinks] = useState<readonly WorkspaceQuickLink[]>(quickLinks);
  const [relateNodeId, setRelateNodeId] = useState<string | null>(null);
  const didDragRef = useRef<QuickLinkDragState>({ didDrag: false });
  const reorderable = !collapsed && Boolean(onQuickLinksReorder) && quickLinks.length > 1;
  const showNodeActions = Boolean(
    onRemoveQuickLink && onArchiveNode && onDeleteNode,
  );

  useEffect(() => {
    setDisplayLinks(quickLinks);
  }, [quickLinks]);

  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleQuickLinksReorder = useCallback(
    async (nodeIds: string[]) => {
      const nextLinks = nodeIds
        .map((id) => displayLinks.find((link) => link.nodeId === id))
        .filter((link): link is WorkspaceQuickLink => link !== undefined);
      setDisplayLinks(nextLinks);
      if (onQuickLinksReorder) {
        await onQuickLinksReorder(nodeIds);
      }
    },
    [displayLinks, onQuickLinksReorder],
  );

  if (displayLinks.length === 0) return null;

  const sortableIds = displayLinks.map((link) => link.nodeId);

  const linkItems = displayLinks.map((link) => {
    const active = activeView === "node-page" && activeNodeId === link.nodeId;
    const archived =
      active && activeNodeArchived;
    const href = standaloneUrls?.nodes[link.nodeId] ?? nodePageHref(link.nodeId, pageBase);
    return (
      <SortableQuickLinkItem
        key={link.nodeId}
        link={link}
        active={active}
        archived={archived}
        collapsed={collapsed}
        href={href}
        reorderable={reorderable}
        pageBase={pageBase}
        dragState={reorderable ? didDragRef.current : undefined}
        showActions={showNodeActions && !isProtectedEditorNode(link.nodeId, protectedNodeIds)}
        archiveHubTitle={archiveHubTitle}
        onRelate={() => setRelateNodeId(link.nodeId)}
        onRemoveQuickLink={onRemoveQuickLink}
        onArchiveNode={onArchiveNode}
        onUnarchiveNode={onUnarchiveNode}
        onDeleteNode={onDeleteNode}
      />
    );
  });

  return (
    <>
      <div className="tome-side-panel-divider" role="presentation" />
      <div
        className={`tome-side-panel-section${collapsed ? " is-collapsed" : ""}`}
        aria-label="Quick links"
      >
        {reorderable ? (
          <DndContext
            sensors={dragSensors}
            collisionDetection={closestCenter}
            onDragStart={() => {
              didDragRef.current.didDrag = true;
            }}
            onDragCancel={() => {
              didDragRef.current.didDrag = false;
            }}
            onDragEnd={(event) => {
              quickLinksReorderOnDragEnd(event, sortableIds, handleQuickLinksReorder);
            }}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {linkItems}
            </SortableContext>
          </DndContext>
        ) : (
          linkItems
        )}
      </div>
      {relateNodeId ? (
        <AddRelationshipDialog
          api={api}
          nodeId={relateNodeId}
          open
          onClose={() => setRelateNodeId(null)}
        />
      ) : null}
    </>
  );
}
