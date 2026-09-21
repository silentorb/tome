import { useCallback, useRef, useState } from "react";
import { DatabaseTableView } from "./DatabaseTableView";
import { TomeEditor } from "./TomeEditor";
import { PageActionsMenu } from "./PageActionsMenu";
import { PageTitle } from "./PageTitle";
import { NodeMetadataPanel } from "./NodeMetadataPanel";
import { RelationSectionView } from "./RelationSectionView";
import { AddRelationshipDialog } from "./AddRelationshipDialog";
import type { EditorApi } from "../api/client";
import type { DatabaseViewDetail, EditorNodePageDetail } from "../../shared/types";
import { isProtectedEditorNode } from "../../shared/types";
import { isDraftNodeId } from "../draft-page";
import type { NodeBodyDocument } from "tome-graph-interfaces";
import { isDocumentEffectivelyEmpty } from "tome-graph-interfaces";
import { SectionTitle } from "./NodeNameLink";
import "./node-page-view.css";
import "./page-actions-menu.css";

/** Focus the Milkdown body after leaving the page title (e.g. Enter). */
export function focusPageBodyEditor(pageRoot: HTMLElement | null): void {
  const prose = pageRoot?.querySelector<HTMLElement>(".tome-editor-body .ProseMirror");
  prose?.focus();
}

interface NodePageViewProps {
  api: EditorApi;
  node: EditorNodePageDetail;
  /** Live title draft — independent of loaded `node.title` so edits do not remount the body. */
  title: string;
  saveState: "idle" | "dirty" | "saving" | "saved" | "error";
  metadataExpanded: boolean;
  onMetadataExpandedChange: (expanded: boolean) => void;
  onBodyChange: (document: NodeBodyDocument) => void;
  onEditorBaseline?: (document: NodeBodyDocument) => void;
  onTitleChange: (title: string) => void;
  onTabSelect: (tabId: string) => void;
  onDatabaseViewChange: (view: DatabaseViewDetail) => void;
  onArchiveNode: (nodeId: string) => Promise<void>;
  onUnarchiveNode: (nodeId: string) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onTableCellUpdated?: () => void;
  selectTitleOnMount?: boolean;
  onTitleSelected?: () => void;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
  markdownBodyPanel?: boolean;
  isQuickLink?: boolean;
  onAddQuickLink?: () => Promise<void>;
  onRemoveQuickLink?: () => Promise<void>;
}

export function NodePageView({
  api,
  node,
  title,
  saveState,
  metadataExpanded,
  onMetadataExpandedChange,
  onBodyChange,
  onEditorBaseline,
  onTitleChange,
  onTabSelect,
  onDatabaseViewChange,
  onArchiveNode,
  onUnarchiveNode,
  onDeleteNode,
  onTableCellUpdated,
  selectTitleOnMount = false,
  onTitleSelected,
  protectedNodeIds = [],
  archiveHubTitle,
  markdownBodyPanel = false,
  isQuickLink = false,
  onAddQuickLink,
  onRemoveQuickLink,
}: NodePageViewProps) {
  const pageRootRef = useRef<HTMLDivElement>(null);
  const emptyMarkdown = isDocumentEffectivelyEmpty(node.document);
  const showPageActions =
    !isDraftNodeId(node.id) && !isProtectedEditorNode(node.id, protectedNodeIds);
  const [relateOpen, setRelateOpen] = useState(false);
  const focusBodyFromTitle = useCallback(() => {
    focusPageBodyEditor(pageRootRef.current);
  }, []);

  const saveStatusLabel =
    saveState === "dirty"
      ? "Unsaved changes"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "saved"
          ? "Saved"
          : saveState === "error"
            ? "Save failed"
            : "";

  const editor = (
    <TomeEditor
      key={node.id}
      api={api}
      nodeId={node.id}
      initialDocument={node.document}
      onEditorBaseline={onEditorBaseline}
      onBodyChange={onBodyChange}
    />
  );

  return (
    <div className="tome-record-page" ref={pageRootRef}>
      <div className="tome-record-sections">
        <section className="tome-record-section tome-page-title-section">
          {node.archived ? (
            <span className="tome-record-page-archived">Archived</span>
          ) : null}
          <div className="tome-page-title-row">
            <PageTitle
              value={title}
              onChange={onTitleChange}
              onEnter={focusBodyFromTitle}
              selectOnMount={selectTitleOnMount}
              onSelected={onTitleSelected}
            />
            <div className="tome-page-title-actions">
              {showPageActions ? (
                <PageActionsMenu
                  recordTitle={title}
                  archived={node.archived}
                  disabled={saveState === "saving"}
                  archiveHubTitle={archiveHubTitle}
                  onRelate={() => setRelateOpen(true)}
                  isQuickLink={isQuickLink}
                  onAddQuickLink={onAddQuickLink}
                  onRemoveQuickLink={onRemoveQuickLink}
                  onArchive={() => onArchiveNode(node.id)}
                  onUnarchive={() => onUnarchiveNode(node.id)}
                  onDelete={() => onDeleteNode(node.id)}
                />
              ) : null}
              {saveStatusLabel ? (
                <span className={`tome-save-status is-${saveState}`}>{saveStatusLabel}</span>
              ) : null}
            </div>
          </div>
        </section>

        <NodeMetadataPanel
          api={api}
          metadata={node.metadata}
          nodeId={node.id}
          properties={node.properties}
          expanded={metadataExpanded}
          onExpandedChange={onMetadataExpandedChange}
          onCellUpdated={onTableCellUpdated}
        />

        <section
          className={`tome-record-section tome-markdown-section${emptyMarkdown ? " is-empty" : ""}`}
        >
          {markdownBodyPanel ? <div className="tome-content-panel">{editor}</div> : editor}
        </section>

        {showPageActions ? (
          <AddRelationshipDialog
            api={api}
            nodeId={node.id}
            open={relateOpen}
            onClose={() => setRelateOpen(false)}
            onLinked={onTableCellUpdated}
          />
        ) : null}

        {node.sections.map((section, index) => {
          if (section.type === "markdown") return null;
          if (section.type === "database") {
            return (
              <section key={`database-${section.databaseView.tabs.activeTabId}`} className="tome-record-section">
                <SectionTitle
                  api={api}
                  title={section.databaseView.sectionTitle}
                  typeNodeId={
                    node.id === section.databaseView.id ? null : section.databaseView.id
                  }
                />
                <DatabaseTableView
                  api={api}
                  nodeId={node.id}
                  databaseView={section.databaseView}
                  embedded
                  onTabSelect={onTabSelect}
                  onTabsUpdated={onTableCellUpdated}
                  onViewChange={onDatabaseViewChange}
                  onCellUpdated={onTableCellUpdated}
                  onArchiveNode={onArchiveNode}
                  onDeleteNode={onDeleteNode}
                  protectedNodeIds={protectedNodeIds}
                  archiveHubTitle={archiveHubTitle}
                />
              </section>
            );
          }
          return (
            <RelationSectionView
              key={`${section.label}-${index}`}
              api={api}
              nodeId={node.id}
              section={section}
              onCellUpdated={onTableCellUpdated}
              onArchiveNode={onArchiveNode}
              onDeleteNode={onDeleteNode}
              protectedNodeIds={protectedNodeIds}
              archiveHubTitle={archiveHubTitle}
            />
          );
        })}
      </div>
    </div>
  );
}
