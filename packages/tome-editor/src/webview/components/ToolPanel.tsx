import { useEffect, type ComponentType } from "react";
import type { EditorToolPanelSession } from "tome-interfaces/page-block/editor";
import "./tool-panel.css";

export type ToolPanelSession = EditorToolPanelSession;

interface ToolPanelProps {
  session: ToolPanelSession | null;
  onClose: () => void;
}

export function ToolPanel({ session, onClose }: ToolPanelProps) {
  useEffect(() => {
    if (!session) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session, onClose]);

  if (!session) return null;

  const Content = session.Component as ComponentType<Record<string, unknown>>;

  return (
    <aside className="tome-tool-panel" aria-label={session.title}>
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
