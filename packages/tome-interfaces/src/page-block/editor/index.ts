import type { PageBlockComponentRef } from "../types";

export interface EditorSlashMenuSpec {
  label: string;
  group?: string;
  order?: number;
  icon?: string;
}

export interface EditorPageBlockContext {
  component: PageBlockComponentRef;
  nodeId: string;
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
  slashMenu?: EditorSlashMenuSpec;
  insertDefaultData?: () => unknown;
}

export interface EditorPageBlockHost {
  registerPageBlock(registration: EditorPageBlockRegistration): void;
}

export type EditorPageBlockModule = {
  register(host: EditorPageBlockHost): void;
};
