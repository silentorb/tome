import type { PageBlockComponentRef } from "../types";

export interface EditorSlashMenuSpec {
  label: string;
  group?: string;
  order?: number;
  icon?: string;
}

/** Session for the host right tool panel (opened from an interactive page block). */
export interface EditorToolPanelSession {
  title: string;
  /** Framework-agnostic component (React function component in tome-editor). */
  Component: (props: Record<string, unknown>) => unknown;
  props: Record<string, unknown>;
  /** Called when the host closes the panel (close button, Escape, navigation). */
  onClose?: () => void;
}

export interface EditorPageBlockContext {
  component: PageBlockComponentRef;
  nodeId: string;
  /** Invoke this block's server handler (`POST /api/extensions/:componentId/invoke`). */
  invoke?(input: unknown): Promise<unknown>;
  /** Open the host right tool panel (hidden when no session). */
  openToolPanel?(session: EditorToolPanelSession): void;
  /** Close the host right tool panel if open. */
  closeToolPanel?(): void;
}

export interface EditorPageBlockProps {
  ctx: EditorPageBlockContext;
  blockData: unknown;
  onBlockDataChange: (data: unknown) => void;
  readOnly?: boolean;
}

/** Framework-agnostic component type (React or other UI libraries). */
export type EditorPageBlockComponent = (props: EditorPageBlockProps) => unknown;

export interface EditorPageBlockRegistration {
  implementationId: string;
  Component: EditorPageBlockComponent;
  /** When true, the editor mounts `Component` in the page-block embed instead of static HTML. */
  interactive?: boolean;
  slashMenu?: EditorSlashMenuSpec;
  insertDefaultData?: () => unknown;
}

export interface EditorPageBlockHost {
  registerPageBlock(registration: EditorPageBlockRegistration): void;
}

export type EditorPageBlockModule = {
  register(host: EditorPageBlockHost): void;
};
