import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorApi } from "../api/client";
import type { NodeSummary, RelationLink } from "../../shared/types";
import { nodePageHref } from "../node-links";
import {
  createCanvasMeasureWidth,
  formatRelationCellDisplay,
  RELATION_CELL_EDIT_GUTTER_PX,
  relationCellMaxWidthPx,
  RELATION_CELL_MAX_LINES,
} from "./format-relation-cell-display";
import { RecordLinkPicker } from "./RecordLinkPicker";
import { RelationCellLinkIcon } from "./RelationCellLinkIcon";
import "./relation-cell-editor.css";

interface RelationCellEditorProps {
  api: EditorApi;
  links: RelationLink[];
  columnName: string;
  allowedTypeIds?: string[];
  disabled?: boolean;
  onAdd: (targetId: string) => void | Promise<void>;
  onRemove: (targetId: string) => void | Promise<void>;
  /** Called once when the edit popup closes after add/remove mutations in that session. */
  onEditingComplete?: () => void;
}

interface RelationFieldPopupProps {
  api: EditorApi;
  columnName: string;
  links: RelationLink[];
  allowedTypeIds?: string[];
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onAdd: (targetId: string, summary?: NodeSummary) => void | Promise<void>;
  onRemove: (targetId: string) => void | Promise<void>;
}

function sortRelationLinksByTitle(links: readonly RelationLink[]): RelationLink[] {
  return [...links].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
  );
}

function RelationCellLinkLabel({ api, link }: { api: EditorApi; link: RelationLink }) {
  return (
    <a
      href={nodePageHref(link.targetId, window.location.href)}
      className="tome-relation-cell-link"
    >
      <RelationCellLinkIcon />
      <span className="tome-relation-cell-link-title">{link.title}</span>
    </a>
  );
}

function RelationFieldPopup({
  api,
  columnName,
  links,
  allowedTypeIds,
  busy,
  disabled,
  onClose,
  onAdd,
  onRemove,
}: RelationFieldPopupProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const sortedLinks = useMemo(() => sortRelationLinksByTitle(links), [links]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const renderPopupLink = (link: RelationLink) => (
    <a
      href={nodePageHref(link.targetId, window.location.href)}
      className="tome-relation-field-popup-link"
    >
      {link.title}
    </a>
  );

  return (
    <div
      ref={dialogRef}
      className="tome-relation-field-popup"
      role="dialog"
      aria-label={`Edit ${columnName} links`}
    >
      <header className="tome-relation-field-popup-header">
        <span className="tome-relation-field-popup-title">{columnName}</span>
        <button
          type="button"
          className="tome-relation-field-popup-done"
          onClick={onClose}
        >
          Done
        </button>
      </header>
      {sortedLinks.length > 0 ? (
        <div className="tome-relation-field-popup-links">
          <ul className="tome-relation-field-popup-list">
            {sortedLinks.map((link) => (
              <li key={link.targetId} className="tome-relation-field-popup-row">
                {renderPopupLink(link)}
                <button
                  type="button"
                  className="tome-relation-field-popup-remove"
                  aria-label={`Remove ${link.title}`}
                  disabled={disabled || busy}
                  onClick={() => void onRemove(link.targetId)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div
        className={[
          "tome-relation-field-popup-add",
          sortedLinks.length === 0 ? "is-first-section" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <RecordLinkPicker
          api={api}
          embedded
          autoFocus
          closeOnSelect={false}
          allowedTypeIds={allowedTypeIds}
          excludedIds={links.map((link) => link.targetId)}
          ariaLabel={`Search to link ${columnName}`}
          onSelect={onAdd}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

export function RelationCellEditor({
  api,
  links,
  columnName,
  allowedTypeIds,
  disabled = false,
  onAdd,
  onRemove,
  onEditingComplete,
}: RelationCellEditorProps) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localLinks, setLocalLinks] = useState<RelationLink[]>(links);
  const mutatedDuringSession = useRef(false);

  useEffect(() => {
    if (!popupOpen) setLocalLinks(links);
  }, [links, popupOpen]);

  const closePopup = useCallback(() => {
    setPopupOpen(false);
    if (mutatedDuringSession.current) {
      mutatedDuringSession.current = false;
      onEditingComplete?.();
    }
  }, [onEditingComplete]);

  const openPopup = useCallback(() => {
    mutatedDuringSession.current = false;
    setLocalLinks(links);
    setPopupOpen(true);
  }, [links]);

  const measureWidth = useMemo(() => createCanvasMeasureWidth(), []);
  const maxWidthPx = useMemo(
    () => Math.max(80, relationCellMaxWidthPx() - RELATION_CELL_EDIT_GUTTER_PX),
    [],
  );

  const display = useMemo(
    () =>
      formatRelationCellDisplay(links, {
        maxWidthPx,
        maxLines: RELATION_CELL_MAX_LINES,
        measureWidth,
      }),
    [links, maxWidthPx, measureWidth],
  );

  const editLabel = `Edit ${columnName} links`;

  const togglePopup = useCallback(() => {
    if (popupOpen) {
      closePopup();
      return;
    }
    openPopup();
  }, [closePopup, openPopup, popupOpen]);

  const run = useCallback(async (action: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, []);

  const handleAdd = useCallback(
    async (targetId: string, summary?: NodeSummary) => {
      await run(async () => {
        await onAdd(targetId);
        mutatedDuringSession.current = true;
        const title = summary?.title ?? "Untitled";
        setLocalLinks((prev) => {
          if (prev.some((link) => link.targetId === targetId)) return prev;
          return [...prev, { targetId, title }];
        });
      });
    },
    [onAdd, run],
  );

  const handleRemove = useCallback(
    async (targetId: string) => {
      await run(async () => {
        await onRemove(targetId);
        mutatedDuringSession.current = true;
        setLocalLinks((prev) => prev.filter((link) => link.targetId !== targetId));
      });
    },
    [onRemove, run],
  );

  const cellClassName = [
    "tome-relation-cell",
    busy ? "is-busy" : "",
    popupOpen ? "is-popup-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cellClassName}>
      <div className="tome-relation-cell-content">
        <button
          type="button"
          className="tome-relation-cell-hit-area"
          aria-hidden="true"
          tabIndex={-1}
          disabled={disabled || busy}
          onClick={togglePopup}
        />
        <div className="tome-relation-cell-links">
          {links.length === 0 ? (
            <span className="tome-relation-cell-placeholder">—</span>
          ) : (
            <>
              {display.visibleLinks.map((link) => (
                <RelationCellLinkLabel key={link.targetId} api={api} link={link} />
              ))}
              {display.overflowCount > 0 ? (
                <span className="tome-relation-cell-overflow">{display.overflowCount}+</span>
              ) : null}
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        className="tome-relation-cell-edit"
        aria-label={editLabel}
        aria-haspopup="dialog"
        aria-expanded={popupOpen}
        disabled={disabled || busy}
        onClick={togglePopup}
      >
        <span className="tome-relation-cell-edit-icon" aria-hidden="true">
          ✎
        </span>
      </button>
      {popupOpen ? (
        <RelationFieldPopup
          api={api}
          columnName={columnName}
          links={localLinks}
          allowedTypeIds={allowedTypeIds}
          busy={busy}
          disabled={disabled}
          onClose={closePopup}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      ) : null}
    </div>
  );
}
