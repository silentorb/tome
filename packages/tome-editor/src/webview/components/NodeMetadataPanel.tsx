import { useEffect, useRef, useState } from "react";
import type { EditorApi } from "../api/client";
import type { NodePageMetadata, PropertiesSection } from "../../shared/types";
import { NodeNameLink } from "./NodeNameLink";
import { PropertiesSectionView } from "./PropertiesSectionView";
import "./node-metadata-panel.css";

interface NodeMetadataPanelProps {
  api: EditorApi;
  metadata: NodePageMetadata;
  nodeId: string;
  properties: PropertiesSection | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onCellUpdated?: () => void;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NodeMetadataPanel({
  api,
  metadata,
  nodeId,
  properties,
  expanded,
  onExpandedChange,
  onCellUpdated,
}: NodeMetadataPanelProps) {
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const backlinksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!backlinksOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!backlinksRef.current?.contains(event.target as Node)) {
        setBacklinksOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [backlinksOpen]);

  const summary = `${metadata.relationshipCount} relationship${metadata.relationshipCount === 1 ? "" : "s"} · ${metadata.backlinks.length} backlink${metadata.backlinks.length === 1 ? "" : "s"}`;

  return (
    <section
      className={`tome-record-metadata-panel${expanded ? " is-expanded" : ""}`}
      aria-label="Node metadata"
    >
      <button
        type="button"
        className="tome-record-metadata-toggle"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        <span className="tome-record-metadata-chevron" aria-hidden="true">
          ›
        </span>
        <span>Metadata</span>
        {!expanded ? <span className="tome-record-metadata-summary">{summary}</span> : null}
      </button>

      {expanded ? (
        <div className="tome-record-metadata-body">
          <div className="tome-record-metadata-row">
            <span className="tome-record-metadata-label">Created</span>
            <span className="tome-record-metadata-value">
              {formatTimestamp(metadata.createdAt)}
            </span>
          </div>
          <div className="tome-record-metadata-row">
            <span className="tome-record-metadata-label">Modified</span>
            <span className="tome-record-metadata-value">
              {formatTimestamp(metadata.modifiedAt)}
            </span>
          </div>
          <div className="tome-record-metadata-row">
            <span className="tome-record-metadata-label">Relationships</span>
            <span className="tome-record-metadata-value">{metadata.relationshipCount}</span>
          </div>
          <div className="tome-record-metadata-row">
            <span className="tome-record-metadata-label">Backlinks</span>
            <div className="tome-record-metadata-value tome-record-metadata-backlinks" ref={backlinksRef}>
              <button
                type="button"
                className="tome-record-metadata-backlinks-trigger"
                aria-haspopup="menu"
                aria-expanded={backlinksOpen}
                onClick={() => setBacklinksOpen((open) => !open)}
              >
                {metadata.backlinks.length}
                <span aria-hidden="true">▾</span>
              </button>
              {backlinksOpen ? (
                <div className="tome-record-metadata-backlinks-menu" role="menu">
                  {metadata.backlinks.length === 0 ? (
                    <div className="tome-record-metadata-backlink-empty">No backlinks</div>
                  ) : (
                    metadata.backlinks.map((backlink) => (
                      <div key={backlink.sourceId} className="tome-record-metadata-backlink-item" role="none">
                        <NodeNameLink api={api} nodeId={backlink.sourceId}>
                          {backlink.title}
                        </NodeNameLink>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
          {properties ? (
            <div className="tome-record-metadata-properties">
              <PropertiesSectionView
                api={api}
                nodeId={nodeId}
                section={properties}
                onCellUpdated={onCellUpdated}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
