import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DatabaseColumnDef } from "../../shared/types";
import "./enum-select-cell.css";

interface EnumSelectCellProps {
  def: DatabaseColumnDef;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void | Promise<void>;
}

interface MenuPosition {
  top: number;
  left: number;
  minWidth: number;
}

function menuOptions(options: string[], value: string): string[] {
  if (value && !options.includes(value)) {
    return [...options, value];
  }
  return options;
}

function displayOptions(
  options: string[],
  defaultOrder: "asc" | "desc" | undefined,
  value: string,
): string[] {
  const ordered = defaultOrder === "desc" ? [...options].reverse() : options;
  return menuOptions(ordered, value);
}

function storedValueInOptions(value: string, options: string[]): boolean {
  return Boolean(value && options.includes(value));
}

export function EnumSelectCell({ def, value, disabled = false, onChange }: EnumSelectCellProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const menuId = `tome-enum-menu-${reactId.replace(/:/g, "")}`;

  const options = def.options ?? [];
  const allOptions = displayOptions(options, def.defaultOrder, value);
  const isDisabled = disabled || saving;
  const hasStoredValue = storedValueInOptions(value, options);
  const triggerLabel = hasStoredValue
    ? value
    : value && !options.includes(value)
      ? value
      : "—";

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: rect.width,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    setMenuPosition(null);
  }, []);

  const openMenu = useCallback(() => {
    if (isDisabled) return;
    setOpen(true);
    const index = hasStoredValue ? allOptions.indexOf(value) : -1;
    setActiveIndex(index >= 0 ? index : 0);
  }, [allOptions, hasStoredValue, isDisabled, value]);

  const selectOption = useCallback(
    async (next: string) => {
      closeMenu();
      if (next === value) return;
      setSaving(true);
      try {
        await onChange(next);
      } finally {
        setSaving(false);
      }
    },
    [closeMenu, onChange, value],
  );

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % allOptions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? allOptions.length - 1 : index - 1));
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        const next = allOptions[activeIndex];
        if (next) void selectOption(next);
      }
    };

    const onScrollOrResize = () => closeMenu();

    const attachOutside = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);

    return () => {
      window.clearTimeout(attachOutside);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [activeIndex, allOptions, closeMenu, open, selectOption]);

  if (options.length === 0) {
    return value ? <span className="tome-database-cell-badge">{value}</span> : null;
  }

  return (
    <div className="tome-enum-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={[
          "tome-enum-select-trigger",
          "tome-database-cell-badge",
          !hasStoredValue && !value ? "is-empty" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={def.name}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
      >
        {triggerLabel}
      </button>
      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="tome-enum-select-menu"
              role="listbox"
              aria-label={def.name}
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                minWidth: menuPosition.minWidth,
              }}
            >
              {allOptions.map((option, index) => {
                const isSelected = option === value;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`tome-enum-select-option${index === activeIndex ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => void selectOption(option)}
                  >
                    <span className="tome-enum-select-option-label">{option}</span>
                    {isSelected ? (
                      <span className="tome-enum-select-option-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
