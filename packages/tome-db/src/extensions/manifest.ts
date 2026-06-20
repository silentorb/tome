import type { PageBlockComponentRef } from "tome-interfaces/page-block";
import type {
  ExtensionComponentEntry,
  ExtensionEntry,
  ExtensionsFile,
} from "./extensions-file";

export interface ResolvedExtensionComponent extends PageBlockComponentRef {
  kind: "page-block";
  slashMenu?: { group?: string; order?: number };
  extension: Pick<ExtensionEntry, "id" | "editorModule" | "htmlModule" | "serverModule">;
}

export interface ExtensionsManifest {
  extensions: ExtensionEntry[];
  components: ResolvedExtensionComponent[];
}

function mergeParams(
  extensionParams: Record<string, unknown> | undefined,
  componentParams: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...extensionParams, ...componentParams };
}

export function resolveExtensionsManifest(file: ExtensionsFile): ExtensionsManifest {
  const enabledExtensions = new Map<string, ExtensionEntry>();
  for (const extension of file.extensions) {
    if (extension.enabled) {
      enabledExtensions.set(extension.id, extension);
    }
  }

  const components: ResolvedExtensionComponent[] = [];
  for (const component of file.components) {
    if (!component.enabled || component.kind !== "page-block") continue;
    const extension = enabledExtensions.get(component.extensionId);
    if (!extension) continue;
    components.push(toResolvedComponent(component, extension));
  }

  return {
    extensions: [...enabledExtensions.values()],
    components,
  };
}

function toResolvedComponent(
  component: ExtensionComponentEntry,
  extension: ExtensionEntry,
): ResolvedExtensionComponent {
  return {
    id: component.id,
    extensionId: component.extensionId,
    implementationId: component.implementationId,
    label: component.label,
    kind: "page-block",
    params: mergeParams(extension.params, component.params),
    slashMenu: component.slashMenu,
    extension: {
      id: extension.id,
      editorModule: extension.editorModule,
      htmlModule: extension.htmlModule,
      serverModule: extension.serverModule,
    },
  };
}

export function findComponentById(
  manifest: ExtensionsManifest,
  componentId: string,
): ResolvedExtensionComponent | undefined {
  return manifest.components.find((component) => component.id === componentId);
}
