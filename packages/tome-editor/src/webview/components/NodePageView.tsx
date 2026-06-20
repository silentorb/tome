import { useState } from "react";
import { DatabaseTableView } from "./DatabaseTableView";
import { TomeEditor } from "./TomeEditor";
import { OrderedAssociationView } from "./OrderedAssociationView";
import { PageActionsMenu } from "./PageActionsMenu";
import { PageTitle } from "./PageTitle";
import { NodeMetadataPanel } from "./NodeMetadataPanel";
import { RelationSectionView } from "./RelationSectionView";
import { AddRelationshipDialog } from "./AddRelationshipDialog";
import type { EditorApi } from "../api/client";
import type { OrderedAssociationViewDetail, NodePageDetail } from "../../shared/types";
import { isProtectedEditorNode } from "../../shared/types";
import { isEffectivelyEmptyMarkdown, resolvePageTitleAndContent } from "../markdown-body";
import { SectionTitle } from "./NodeNameLink";
import "./node-page-view.css";
import "./page-actions-menu.css";

interface NodePageViewProps {
  api: EditorApi;
  node: NodePageDetail;
  saveState: "idle" | "dirty" | "saving" | "saved" | "error";
  metadataExpanded: boolean;
  onMetadataExpandedChange: (expanded: boolean) => void;
  onBodyChange: (body: string) => void;
  onEditorBaseline?: (body: string) => void;
  onTitleChange: (title: string) => void;
  onTabSelect: (tabId: string) => void;
  onOrderedAssociationViewChange: (view: OrderedAssociationViewDetail) => void;
  onArchiveNode: (nodeId: string) => Promise<void>;
  onUnarchiveNode: (nodeId: string) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onTableCellUpdated?: () => void;
  selectTitleOnMount?: boolean;
  onTitleSelected?: () => void;
  protectedNodeIds?: readonly string[];
  archiveHubTitle?: string;
}

export function NodePageView({
  api,
  node,
  saveState,
  metadataExpanded,
  onMetadataExpandedChange,
  onBodyChange,
  onEditorBaseline,
  onTitleChange,
  onTabSelect,
  onOrderedAssociationViewChange,
  onArchiveNode,
  onUnarchiveNode,
  onDeleteNode,
  onTableCellUpdated,
  selectTitleOnMount = false,
  onTitleSelected,
  protectedNodeIds = [],
  archiveHubTitle,
}: NodePageViewProps) {
  const { content } = resolvePageTitleAndContent(node.body, node.title);
  const emptyMarkdown = isEffectivelyEmptyMarkdown(node.body, node.title);
  const editorBody = emptyMarkdown ? "" : content;
  const showPageActions = !isProtectedEditorNode(node.id, protectedNodeIds);
  const [relateOpen, setRelateOpen] = useState(false);

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

  return (
    <div className="tome-record-page">
      <div className="tome-record-sections">
        <section className="tome-record-section tome-page-title-section">
          {node.archived ? (
            <span className="tome-record-page-archived">Archived</span>
          ) : null}
          <div className="tome-page-title-row">
            <PageTitle
              value={node.title}
              onChange={onTitleChange}
              selectOnMount={selectTitleOnMount}
              onSelected={onTitleSelected}
            />
            <div className="tome-page-title-actions">
              {showPageActions ? (
                <PageActionsMenu
                  recordTitle={node.title}
                  archived={node.archived}
                  disabled={saveState === "saving"}
                  archiveHubTitle={archiveHubTitle}
                  onRelate={() => setRelateOpen(true)}
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
          <TomeEditor
            key={node.id}
            api={api}
            nodeId={node.id}
            initialBody={editorBody}
            onEditorBaseline={onEditorBaseline}
            onBodyChange={onBodyChange}
          />
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
                  title="Items"
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
                  onCellUpdated={onTableCellUpdated}
                  onArchiveNode={onArchiveNode}
                  onDeleteNode={onDeleteNode}
                  protectedNodeIds={protectedNodeIds}
                  archiveHubTitle={archiveHubTitle}
                />
              </section>
            );
          }
          if (section.type === "ordered-association") {
            return (
              <section
                key={`ordered-association-${section.configId}-${section.view.tabs.activeTabId}`}
                className="tome-record-section"
              >
                <SectionTitle
                  api={api}
                  title="Items"
                  typeNodeId={
                    node.id === section.view.typeDatabaseId ? null : section.view.typeDatabaseId
                  }
                />
                <OrderedAssociationView
                  api={api}
                  nodeId={node.id}
                  configId={section.configId}
                  view={section.view}
                  onTabSelect={onTabSelect}
                  onViewChange={onOrderedAssociationViewChange}
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
