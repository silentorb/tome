import type { ReactNode } from "react";
import type { EditorApi } from "../api/client";
import { nodePageHref } from "../node-links";

interface NodeNameLinkProps {
  api: EditorApi;
  nodeId: string;
  children: ReactNode;
  className?: string;
}

export function NodeNameLink({
  api,
  nodeId,
  children,
  className = "tome-record-link",
}: NodeNameLinkProps) {
  return (
    <a
      href={nodePageHref(nodeId, window.location.href)}
      className={className}
    >
      {children}
    </a>
  );
}

interface SectionTitleProps {
  api: EditorApi;
  title: string;
  typeNodeId?: string | null;
}

export function SectionTitle({ api, title, typeNodeId }: SectionTitleProps) {
  return (
    <h2 className="tome-record-section-title">
      {typeNodeId ? (
        <NodeNameLink
          api={api}
          nodeId={typeNodeId}
          className="tome-record-section-title-link"
        >
          {title}
        </NodeNameLink>
      ) : (
        title
      )}
    </h2>
  );
}
