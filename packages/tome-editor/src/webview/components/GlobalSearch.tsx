import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorApi } from "../api/client";
import type { NodeSummary } from "../../shared/types";
import { useUserSettings } from "../hooks/useUserSettings";
import { nodePageHref } from "../node-links";
import "./global-search.css";

interface GlobalSearchProps {
  api: EditorApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ api, open, onOpenChange }: GlobalSearchProps) {
  const { globalSearchIncludeBody, setGlobalSearchIncludeBody } = useUserSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NodeSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setActiveIndex(0);
    setError(null);
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void api
        .search(query, 25, undefined, {
          includeBody: globalSearchIncludeBody,
        })
        .then((items) => setResults(items))
        .catch((err) => {
          setResults([]);
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setLoading(false));
    }, 120);
    return () => window.clearTimeout(handle);
  }, [api, globalSearchIncludeBody, open, query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  const activateActiveResult = useCallback(
    (openInNewTab: boolean) => {
      const link = listRef.current?.querySelector(
        ".tome-global-search-item.is-active",
      ) as HTMLAnchorElement | null;
      if (!link) return;

      close();
      if (openInNewTab) {
        link.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            metaKey: true,
          }),
        );
        return;
      }
      link.click();
    },
    [close],
  );

  if (!open) return null;

  const pageBase = typeof window !== "undefined" ? window.location.href : undefined;

  return (
    <div className="tome-global-search-backdrop">
      <div
        ref={dialogRef}
        className="tome-global-search"
        role="dialog"
        aria-modal="true"
        aria-label="Search nodes"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tome-global-search-config">
          <label className="tome-global-search-config-item">
            <input
              type="checkbox"
              checked={globalSearchIncludeBody}
              onChange={(event) => setGlobalSearchIncludeBody(event.target.checked)}
            />
            <span>Search node contents</span>
          </label>
        </div>
        <input
          ref={inputRef}
          type="search"
          className="tome-global-search-input"
          placeholder="Search nodes…"
          value={query}
          aria-controls="tome-global-search-listbox"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }
            if (event.key === "Enter" && results[activeIndex]) {
              event.preventDefault();
              activateActiveResult(event.metaKey || event.ctrlKey);
            }
          }}
        />
        <div
          ref={listRef}
          id="tome-global-search-listbox"
          className="tome-global-search-list"
          role="listbox"
        >
          {error ? <div className="tome-global-search-error">{error}</div> : null}
          {loading && results.length === 0 ? (
            <div className="tome-global-search-empty">Searching…</div>
          ) : null}
          {!loading && results.length === 0 ? (
            <div className="tome-global-search-empty">
              {query.trim() ? "No matching nodes" : "No nodes found"}
            </div>
          ) : (
            results.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <a
                  key={item.id}
                  href={nodePageHref(item.id, pageBase)}
                  role="option"
                  aria-selected={isActive}
                  className={`tome-global-search-item${isActive ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="tome-global-search-title">{item.title}</span>
                  {globalSearchIncludeBody && item.matchPreview ? (
                    <span className="tome-global-search-preview">
                      {item.matchPreview.parts.map((part, partIndex) =>
                        part.highlight ? (
                          <strong key={partIndex}>{part.text}</strong>
                        ) : (
                          <span key={partIndex}>{part.text}</span>
                        ),
                      )}
                    </span>
                  ) : null}
                </a>
              );
            })
          )}
        </div>
        <div className="tome-global-search-footer">
          ↑↓ navigate · Enter open · Ctrl/Cmd+Enter open in new tab · Esc close
        </div>
      </div>
    </div>
  );
}
