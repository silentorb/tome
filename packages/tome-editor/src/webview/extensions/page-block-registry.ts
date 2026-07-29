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
let componentsById = new Map<string, PublicExtensionComponent>();
let invokeExtensionFn:
  | ((componentId: string, input?: unknown, nodeId?: string) => Promise<unknown>)
  | null = null;
let toolPanelHandlers: PageBlockToolPanelHandlers | null = null;

export function setPageBlockInvokeExtension(
  fn: ((componentId: string, input?: unknown, nodeId?: string) => Promise<unknown>) | null,
): void {
  invokeExtensionFn = fn;
}

export function setPageBlockToolPanelHandlers(handlers: PageBlockToolPanelHandlers | null): void {
  toolPanelHandlers = handlers;
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

  await Promise.all(
    manifest.editorBundles.map(async ({ extensionId, url }) => {
      if (loadedExtensionIds.has(extensionId)) return;
      try {
        const mod = (await import(/* @vite-ignore */ url)) as EditorPageBlockModule & {
          default?: EditorPageBlockModule;
        };
        const register = mod.register ?? mod.default?.register;
        if (typeof register !== "function") {
          console.error(`Extension ${extensionId} editor bundle missing register(host)`);
          return;
        }
        register(host);
        loadedExtensionIds.add(extensionId);
      } catch (err: unknown) {
        console.error(`Failed to load editor bundle for ${extensionId}:`, err);
      }
    }),
  );
}

export function getPublicExtensionComponent(
  componentId: string,
): PublicExtensionComponent | undefined {
  return componentsById.get(componentId);
}

export function getInteractivePageBlockRegistration(
  componentId: string,
): EditorPageBlockRegistration | undefined {
  const component = componentsById.get(componentId);
  if (!component?.interactive) return undefined;
  return host.get(component.implementationId);
}

/** Test helper: reset client registry state. */
export function resetPageBlockRegistryForTests(): void {
  host.clear();
  loadedExtensionIds.clear();
  componentsById = new Map();
  invokeExtensionFn = null;
  toolPanelHandlers = null;
}

/** Test helper: register an interactive page block and public component metadata. */
export function registerInteractivePageBlockForTests(
  component: PublicExtensionComponent,
  registration: EditorPageBlockRegistration,
): void {
  componentsById.set(component.id, { ...component, interactive: true });
  host.registerPageBlock({ ...registration, interactive: true });
}
