import { useEffect, useRef } from "react";
import "./page-title.css";

interface PageTitleProps {
  value: string;
  onChange: (value: string) => void;
  selectOnMount?: boolean;
  onSelected?: () => void;
}

function focusAndSelectTitle(el: HTMLTextAreaElement): void {
  el.focus();
  el.setSelectionRange(0, el.value.length);
}

export function PageTitle({ value, onChange, selectOnMount = false, onSelected }: PageTitleProps) {
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

  return (
    <textarea
      ref={ref}
      className="tome-page-title"
      aria-label="Page title"
      value={value}
      rows={1}
      placeholder="Untitled"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
