import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { EditorToolPanelSession } from "tome-interfaces/page-block/editor";
import {
  DEFAULT_TOOL_PANEL_WIDTH_PX,
  MIN_TOOL_PANEL_WIDTH_PX,
  clampToolPanelWidthPx,
  readToolPanelWidthPx,
  writeToolPanelWidthPx,
} from "../tool-panel-preferences";
import "./tool-panel.css";

export type ToolPanelSession = EditorToolPanelSession;

interface ToolPanelProps {
  session: ToolPanelSession | null;
  onClose: () => void;
}

const KEYBOARD_NUDGE_PX = 16;

function viewportWidthPx(): number {
  return typeof window !== "undefined" ? window.innerWidth : DEFAULT_TOOL_PANEL_WIDTH_PX / 0.4;
}

function clampOptions(layoutWidthPx?: number) {
  return {
    viewportWidthPx: viewportWidthPx(),
    layoutWidthPx,
  };
}

export function ToolPanel({ session, onClose }: ToolPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [widthPx, setWidthPx] = useState(() => readToolPanelWidthPx(clampOptions()));
  const [dragging, setDragging] = useState(false);

  const reclampToLayout = useCallback(() => {
    const layoutWidth = panelRef.current?.parentElement?.clientWidth;
    setWidthPx((prev) => clampToolPanelWidthPx(prev, clampOptions(layoutWidth)));
  }, []);

  useEffect(() => {
    if (!session) return;
    reclampToLayout();
    const onResize = () => reclampToLayout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [session, reclampToLayout]);

  const onPanelKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  const persistWidth = useCallback((next: number) => {
    const layoutWidth = panelRef.current?.parentElement?.clientWidth;
    const clamped = writeToolPanelWidthPx(next, clampOptions(layoutWidth));
    setWidthPx(clamped);
    return clamped;
  }, []);

  const onHandlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: widthPx,
    };
    setDragging(true);
  }, [widthPx]);

  const onHandlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = drag.startX - event.clientX;
    const layoutWidth = panelRef.current?.parentElement?.clientWidth;
    setWidthPx(clampToolPanelWidthPx(drag.startWidth + delta, clampOptions(layoutWidth)));
  }, []);

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      const delta = drag.startX - event.clientX;
      persistWidth(drag.startWidth + delta);
    },
    [persistWidth],
  );

  const onHandleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        persistWidth(widthPx + KEYBOARD_NUDGE_PX);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        persistWidth(widthPx - KEYBOARD_NUDGE_PX);
      } else if (event.key === "Home") {
        event.preventDefault();
        const layoutWidth = panelRef.current?.parentElement?.clientWidth;
        persistWidth(
          clampToolPanelWidthPx(Number.POSITIVE_INFINITY, clampOptions(layoutWidth)),
        );
      } else if (event.key === "End") {
        event.preventDefault();
        persistWidth(0);
      }
    },
    [persistWidth, widthPx],
  );

  if (!session) return null;

  const Content = session.Component as ComponentType<Record<string, unknown>>;

  return (
    <aside
      ref={panelRef}
      className={`tome-tool-panel${dragging ? " tome-tool-panel-dragging" : ""}`}
      aria-label={session.title}
      style={{ width: `${widthPx}px`, ["--tome-tool-panel-width" as string]: `${widthPx}px` }}
      onKeyDown={onPanelKeyDown}
    >
      <div
        className="tome-tool-panel-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tool panel"
        aria-valuenow={Math.round(widthPx)}
        aria-valuemin={Math.round(MIN_TOOL_PANEL_WIDTH_PX)}
        tabIndex={0}
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onHandleKeyDown}
      />
      <div className="tome-tool-panel-header">
        <h2 className="tome-tool-panel-title">{session.title}</h2>
        <button
          type="button"
          className="tome-tool-panel-close"
          onClick={onClose}
          aria-label="Close panel"
          title="Close"
        >
          ×
        </button>
      </div>
      <div className="tome-tool-panel-body">
        <Content {...session.props} />
      </div>
    </aside>
  );
}
