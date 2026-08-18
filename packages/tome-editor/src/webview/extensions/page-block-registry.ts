import type {
  EditorPageBlockHost,
  EditorPageBlockModule,
  EditorPageBlockRegistration,
  EditorToolPanelSession,
} from "tome-interfaces/page-block/editor";
import type { PublicExtensionComponent, PublicExtensionsManifest } from "tome-graph-interfaces";

export type PageBlockToolPanelHandlers = {
  open: (session: EditorToolPanelSession) => void;
  close: () => void;
};

export type PageBlockParameterHandlers = {
  getBlockParameters: (
    nodeId: string,
    componentId: string,
  ) => Record<string, string | number | boolean | null>;
  setBlockParameter: (
    nodeId: string,
    componentId: string,
    paramId: string,
    value: string | number | boolean | null,
  ) => void;
};

export type InteractivePageBlockMount =
  | {
      kind: "interactive";
      component: PublicExtensionComponent;
      registration: EditorPageBlockRegistration;
    }
  | {
      kind: "interactive-unavailable";
      component: PublicExtensionComponent;
      error: string;
    }
  | { kind: "static" };

class ClientEditorPageBlockHost implements EditorPageBlockHost {
  readonly #blocks = new Map<string, EditorPageBlockRegistration>();

  registerPageBlock(registration: EditorPageBlockRegistration): void {
    this.#blocks.set(registration.implementationId, registration);
  }

  get(implementationId: string): EditorPageBlockRegistration | undefined {
    return this.#blocks.get(implementationId);
  }

  clear(): void {
    this.#blocks.clear();
  }
}

const host = new ClientEditorPageBlockHost();
const loadedExtensionIds = new Set<string>();
/** extensionId → last load error message (cleared on success). */
const editorBundleErrors = new Map<string, string>();
let componentsById = new Map<string, PublicExtensionComponent>();
let invokeExtensionFn:
  | ((componentId: string, input?: unknown, nodeId?: string) => Promise<unknown>)
  | null = null;
let toolPanelHandlers: PageBlockToolPanelHandlers | null = null;
let parameterHandlers: PageBlockParameterHandlers | null = null;

export function setPageBlockInvokeExtension(
  fn: ((componentId: string, input?: unknown, nodeId?: string) => Promise<unknown>) | null,
): void {
  invokeExtensionFn = fn;
}

export function setPageBlockToolPanelHandlers(handlers: PageBlockToolPanelHandlers | null): void {
  toolPanelHandlers = handlers;
}

export function setPageBlockParameterHandlers(
  handlers: PageBlockParameterHandlers | null,
): void {
  parameterHandlers = handlers;
}

export function getPageBlockParameterHandlers(): PageBlockParameterHandlers | null {
  return parameterHandlers;
}

export function openPageBlockToolPanel(session: EditorToolPanelSession): void {
  toolPanelHandlers?.open(session);
}

export function closePageBlockToolPanel(): void {
  toolPanelHandlers?.close();
}

export async function invokePageBlockExtension(
  componentId: string,
  input?: unknown,
  nodeId?: string,
): Promise<unknown> {
  if (!invokeExtensionFn) {
    throw new Error("Page block invokeExtension is not configured");
  }
  return invokeExtensionFn(componentId, input, nodeId);
}

export async function loadEditorBundles(manifest: PublicExtensionsManifest): Promise<void> {
  componentsById = new Map(manifest.components.map((component) => [component.id, component]));

  // Load sequentially so the API's Bun.build queue is not stampeded on first paint.
  for (const { extensionId, url } of manifest.editorBundles) {
    if (loadedExtensionIds.has(extensionId)) continue;
    try {
      const mod = (await import(/* @vite-ignore */ url)) as EditorPageBlockModule & {
        default?: EditorPageBlockModule;
      };
      const register = mod.register ?? mod.default?.register;
      if (typeof register !== "function") {
        const message = `Extension ${extensionId} editor bundle missing register(host)`;
        console.error(message);
        editorBundleErrors.set(extensionId, message);
        continue;
      }
      register(host);
      loadedExtensionIds.add(extensionId);
      editorBundleErrors.delete(extensionId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to load editor bundle for ${extensionId}:`, err);
      editorBundleErrors.set(extensionId, message);
    }
  }
}

export function getPublicExtensionComponent(
  componentId: string,
): PublicExtensionComponent | undefined {
  return componentsById.get(componentId);
}

export function getEditorBundleError(extensionId: string): string | undefined {
  return editorBundleErrors.get(extensionId);
}

export function getInteractivePageBlockRegistration(
  componentId: string,
): EditorPageBlockRegistration | undefined {
  const component = componentsById.get(componentId);
  if (!component?.interactive) return undefined;
  return host.get(component.implementationId);
}

/** Resolve how an embed should mount: React, explicit error, or static HTML. */
export function resolveInteractivePageBlockMount(componentId: string): InteractivePageBlockMount {
  const component = componentsById.get(componentId);
  if (!component?.interactive) return { kind: "static" };

  const registration = host.get(component.implementationId);
  if (registration?.Component) {
    return { kind: "interactive", component, registration };
  }

  const bundleError = getEditorBundleError(component.extensionId);
  const error =
    bundleError ??
    `Interactive editor for “${component.label}” failed to load. Check the browser console for “Failed to load editor bundle for ${component.extensionId}".`;
  return { kind: "interactive-unavailable", component, error };
}

/** Test helper: reset client registry state. */
export function resetPageBlockRegistryForTests(): void {
  host.clear();
  loadedExtensionIds.clear();
  editorBundleErrors.clear();
  componentsById = new Map();
  invokeExtensionFn = null;
  toolPanelHandlers = null;
}

/** Test helper: record a bundle load error without importing. */
export function setEditorBundleErrorForTests(extensionId: string, message: string): void {
  editorBundleErrors.set(extensionId, message);
}

/** Test helper: register an interactive page block and public component metadata. */
export function registerInteractivePageBlockForTests(
  component: PublicExtensionComponent,
  registration: EditorPageBlockRegistration,
): void {
  componentsById.set(component.id, { ...component, interactive: true });
  host.registerPageBlock({ ...registration, interactive: true });
}
