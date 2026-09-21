import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import "./page-title.css";

interface PageTitleProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter while editing the title — typically focus the page body. */
  onEnter?: () => void;
  selectOnMount?: boolean;
  onSelected?: () => void;
}

/** Node titles are single-line; strip any newlines from paste or programmatic input. */
export function stripTitleNewlines(value: string): string {
  return value.replace(/\r\n|\r|\n/g, "");
}

function focusAndSelectTitle(el: HTMLTextAreaElement): void {
  el.focus();
  el.setSelectionRange(0, el.value.length);
}

export function PageTitle({
  value,
  onChange,
  onEnter,
  selectOnMount = false,
  onSelected,
}: PageTitleProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!selectOnMount) return;
    const el = ref.current;
    if (!el) return;

    const immediate = window.setTimeout(() => {
      focusAndSelectTitle(el);
      onSelected?.();
    }, 0);
    const retry = window.setTimeout(() => {
      if (document.activeElement !== el) focusAndSelectTitle(el);
    }, 150);

    return () => {
      window.clearTimeout(immediate);
      window.clearTimeout(retry);
    };
  }, [selectOnMount, onSelected]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onEnter?.();
  };

  return (
    <textarea
      ref={ref}
      className="tome-page-title"
      aria-label="Page title"
      value={value}
      rows={1}
      placeholder="Untitled"
      onKeyDown={handleKeyDown}
      onChange={(event) => onChange(stripTitleNewlines(event.target.value))}
    />
  );
}
