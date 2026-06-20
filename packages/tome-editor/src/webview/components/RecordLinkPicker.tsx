import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorApi } from "../api/client";
import type { NodeSummary } from "../../shared/types";
import "./record-link-picker.css";

const DEFAULT_SEARCH_LIMIT = 25;
/** When type-filtered, list all eligible records (API cap matches graph batch fetch). */
const TYPE_SCOPED_SEARCH_LIMIT = 5000;

interface RecordLinkPickerProps {
  api: EditorApi;
  allowedTypeIds?: string[];
  excludedIds: readonly string[];
  ariaLabel: string;
  onSelect: (nodeId: string, summary?: NodeSummary) => void | Promise<void>;
  onClose: () => void;
  /** When false, keep picker open after a successful selection (default true). */
  closeOnSelect?: boolean;
  /** When true, skip document click-outside handling (parent dialog owns dismissal). */
  embedded?: boolean;
  /** Max search results to request (default 25). */
  searchLimit?: number;
  /** Focus the search input on mount (default: true when not embedded). */
  autoFocus?: boolean;
}

export function RecordLinkPicker({
  api,
  allowedTypeIds,
  excludedIds,
  ariaLabel,
  onSelect,
  onClose,
  closeOnSelect = true,
  embedded = false,
  searchLimit,
  autoFocus,
}: RecordLinkPickerProps) {
  const shouldAutoFocus = autoFocus ?? !embedded;
  const effectiveSearchLimit =
    searchLimit ??
    (allowedTypeIds && allowedTypeIds.length > 0
      ? TYPE_SCOPED_SEARCH_LIMIT
      : DEFAULT_SEARCH_LIMIT);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollActiveIntoViewRef = useRef(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NodeSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const excluded = useRef(new Set(excludedIds));

  excluded.current = new Set(excludedIds);

  useEffect(() => {
    if (!shouldAutoFocus) return;
    searchRef.current?.focus();
  }, [shouldAutoFocus]);

  useEffect(() => {
    setActiveIndex((index) => {
      const count = results.filter((row) => !excluded.current.has(row.id)).length;
      return Math.min(index, Math.max(0, count - 1));
    });
  }, [excludedIds, results]);

  useEffect(() => {
    if (embedded) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [embedded, onClose]);

  useEffect(() => {
    setActiveIndex(0);
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void api
        .search(query, effectiveSearchLimit, allowedTypeIds)
        .then((items) => setResults(items))
        .catch((err) => {
          setResults([]);
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setLoading(false));
    }, 120);
    return () => window.clearTimeout(handle);
  }, [allowedTypeIds, api, effectiveSearchLimit, query]);

  const selectable = results.filter((item) => !excluded.current.has(item.id));

  useEffect(() => {
    if (!scrollActiveIntoViewRef.current) return;
    scrollActiveIntoViewRef.current = false;
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector(".tome-record-link-picker-item.is-active");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const pick = useCallback(
    async (nodeId: string) => {
      if (excluded.current.has(nodeId) || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const summary = results.find((row) => row.id === nodeId);
        await onSelect(nodeId, summary);
        if (closeOnSelect) {
          onClose();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [closeOnSelect, onClose, onSelect, results, submitting],
  );

  return (
    <div
      ref={rootRef}
      className={`tome-record-link-picker${embedded ? " is-embedded" : ""}`}
      role={embedded ? "group" : "dialog"}
      aria-label={ariaLabel}
    >
      <input
        ref={searchRef}
        type="search"
        className="tome-record-link-picker-search"
        placeholder="Search records…"
        value={query}
        disabled={submitting}
        aria-controls="tome-record-link-picker-listbox"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            scrollActiveIntoViewRef.current = true;
            setActiveIndex((index) => Math.min(index + 1, Math.max(0, selectable.length - 1)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            scrollActiveIntoViewRef.current = true;
            setActiveIndex((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === "Enter" && selectable[activeIndex]) {
            event.preventDefault();
            void pick(selectable[activeIndex]!.id);
          }
        }}
      />
      <div
        ref={listRef}
        id="tome-record-link-picker-listbox"
        className="tome-record-link-picker-list"
        role="listbox"
      >
        {error ? <div className="tome-record-link-picker-error">{error}</div> : null}
        {loading && selectable.length === 0 ? (
          <div className="tome-record-link-picker-empty">Searching…</div>
        ) : null}
        {!loading && selectable.length === 0 ? (
          <div className="tome-record-link-picker-empty">No matching records</div>
        ) : (
          selectable.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={submitting}
                className={`tome-record-link-picker-item${isActive ? " is-active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void pick(item.id)}
              >
                <span className="tome-record-link-picker-title">{item.title}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
