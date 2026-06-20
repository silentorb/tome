import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRelationshipTypeLabel } from "tome-db/relationship-type-label";
import { sortBySearchRelevanceMulti } from "tome-db/search-relevance";
import type { EditorApi } from "../api/client";
import "./record-link-picker.css";

interface RelationshipTypePickerProps {
  api: EditorApi;
  selectedType: string | null;
  ariaLabel: string;
  onSelect: (type: string) => void;
}

export function filterAndSortRelationshipTypes(
  types: readonly string[],
  query: string,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...types];
  const matches = types.filter((type) => {
    if (type.toLowerCase().includes(q)) return true;
    return formatRelationshipTypeLabel(type).toLowerCase().includes(q);
  });
  return sortBySearchRelevanceMulti(matches, query, (type) => [
    formatRelationshipTypeLabel(type),
    type,
  ]);
}

export function RelationshipTypePicker({
  api,
  selectedType,
  ariaLabel,
  onSelect,
}: RelationshipTypePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void api
      .listRelationshipTypes()
      .then((items) => setTypes(items))
      .catch((err) => {
        setTypes([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [api]);

  const filtered = useMemo(
    () => filterAndSortRelationshipTypes(types, query),
    [query, types],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, types.length]);

  const pick = useCallback(
    (type: string) => {
      onSelect(type);
      setQuery("");
      setActiveIndex(0);
    },
    [onSelect],
  );

  const displayValue =
    selectedType && !query ? formatRelationshipTypeLabel(selectedType) : query;

  return (
    <div
      ref={rootRef}
      className="tome-record-link-picker is-embedded"
      role="group"
      aria-label={ariaLabel}
    >
      <input
        type="search"
        className="tome-record-link-picker-search"
        placeholder="Search relationship types…"
        value={displayValue}
        aria-controls="tome-relationship-type-picker-listbox"
        onChange={(event) => {
          setQuery(event.target.value);
          if (selectedType) onSelect("");
        }}
        onFocus={() => {
          if (selectedType && !query) setQuery("");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === "Enter" && filtered[activeIndex]) {
            event.preventDefault();
            pick(filtered[activeIndex]!);
          }
        }}
      />
      <div
        id="tome-relationship-type-picker-listbox"
        className="tome-record-link-picker-list"
        role="listbox"
      >
        {error ? <div className="tome-record-link-picker-error">{error}</div> : null}
        {loading && filtered.length === 0 ? (
          <div className="tome-record-link-picker-empty">Loading types…</div>
        ) : null}
        {!loading && filtered.length === 0 ? (
          <div className="tome-record-link-picker-empty">No matching types</div>
        ) : (
          filtered.map((type, index) => {
            const isActive = index === activeIndex;
            const isSelected = type === selectedType;
            return (
              <button
                key={type}
                type="button"
                role="option"
                aria-selected={isActive || isSelected}
                className={`tome-record-link-picker-item${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(type)}
              >
                <span className="tome-record-link-picker-title">
                  {formatRelationshipTypeLabel(type)}
                </span>
                <span className="tome-record-link-picker-path">{type}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
