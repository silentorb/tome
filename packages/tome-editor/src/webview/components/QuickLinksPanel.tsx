import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
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
import type { WorkspaceQuickLink } from "tome-graph-interfaces";
import type { AppView } from "../../shared/types";
import { isProtectedEditorNode } from "../../shared/types";
import type { SidePanelStandaloneUrls } from "./PrimarySidePanel";
import { nodePageHref } from "../node-links";
import { suppressNavigationClickAfterDragReorder } from "../quick-links-nav";
import { moveColumnOrderItem } from "./SortableDataColumnHeaders";
import { PageActionsMenu } from "./PageActionsMenu";
import "./page-actions-menu.css";

interface QuickLinksPanelProps {
  quickLinks: readonly WorkspaceQuickLink[];
  activeView: AppView;
  activeNodeId?: string | null;
  standaloneUrls?: SidePanelStandaloneUrls;
  pageBase?: string;
  protectedNodeIds?: readonly string[];
  onRemoveQuickLink?: (nodeId: string) => void | Promise<void>;
  onQuickLinksReorder?: (nodeIds: string[]) => void | Promise<void>;
}

interface SortableQuickLinkItemProps {
  link: WorkspaceQuickLink;
  active: boolean;
  href: string;
  reorderable: boolean;
  dragCompleted?: { current: boolean };
  showActions: boolean;
  onRemoveQuickLink?: (nodeId: string) => void | Promise<void>;
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

function SortableQuickLinkItem({
  link,
  active,
  href,
  reorderable,
  dragCompleted,
  showActions,
  onRemoveQuickLink,
}: SortableQuickLinkItemProps) {
  const { nodeId, label } = link;
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
  const itemContent = <span className="tome-side-panel-item-label">{label}</span>;

  const handleAnchorClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!dragCompleted) return;
    suppressNavigationClickAfterDragReorder(event, dragCompleted);
  };

  return (
    <div
      ref={reorderable ? setNodeRef : undefined}
      style={style}
      className={`tome-side-panel-quick-link-item${active ? " is-active" : ""}${isDragging ? " is-dragging" : ""}`}
      {...(reorderable ? { ...attributes, ...listeners } : {})}
    >
      <a
        className={itemClassName}
        href={href}
        title={label}
        onClick={reorderable ? handleAnchorClick : undefined}
      >
        {itemContent}
      </a>
      {showActions && onRemoveQuickLink ? (
        <div className="tome-side-panel-quick-link-actions">
          <PageActionsMenu
            recordTitle={label}
            trigger="vertical-dots"
            menuAlign="right"
            menuPlacement="portal"
            isQuickLink
            onRemoveQuickLink={async () => {
              await onRemoveQuickLink(nodeId);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function QuickLinksPanel({
  quickLinks,
  activeView,
  activeNodeId,
  standaloneUrls,
  pageBase,
  protectedNodeIds = [],
  onRemoveQuickLink,
  onQuickLinksReorder,
}: QuickLinksPanelProps) {
  const [displayLinks, setDisplayLinks] = useState<readonly WorkspaceQuickLink[]>(quickLinks);
  const dragCompletedRef = useRef(false);
  const reorderable = Boolean(onQuickLinksReorder) && quickLinks.length > 1;
  const showLinkActions = Boolean(onRemoveQuickLink);

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
      dragCompletedRef.current = true;
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
    const href = standaloneUrls?.nodes[link.nodeId] ?? nodePageHref(link.nodeId, pageBase);
    return (
      <SortableQuickLinkItem
        key={link.nodeId}
        link={link}
        active={active}
        href={href}
        reorderable={reorderable}
        dragCompleted={reorderable ? dragCompletedRef : undefined}
        showActions={showLinkActions && !isProtectedEditorNode(link.nodeId, protectedNodeIds)}
        onRemoveQuickLink={onRemoveQuickLink}
      />
    );
  });

  return (
    <>
      <div className="tome-side-panel-divider" role="presentation" />
      <div className="tome-side-panel-section" aria-label="Quick links">
        {reorderable ? (
          <DndContext
            sensors={dragSensors}
            collisionDetection={closestCenter}
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
    </>
  );
}
