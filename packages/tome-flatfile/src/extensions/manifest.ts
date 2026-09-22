import type { PageBlockComponentRef } from "tome-interfaces/page-block";
import type {
  ExtensionComponentEntry,
  ExtensionEntry,
  ExtensionsFile,
} from "./extensions-file";

export interface ResolvedExtensionComponent extends PageBlockComponentRef {
  kind: "page-block";
  slashMenu?: { group?: string; order?: number };
  extension: Pick<
    ExtensionEntry,
    "id" | "editorModule" | "htmlModule" | "serverModule" | "searcherModule"
  >;
}

export interface ResolvedSearcherComponent {
  id: string;
  extensionId: string;
  implementationId: string;
  label: string;
  kind: "searcher";
  params: Record<string, unknown>;
  extension: Pick<
    ExtensionEntry,
    "id" | "editorModule" | "htmlModule" | "serverModule" | "searcherModule"
  >;
}

export interface ExtensionsManifest {
  extensions: ExtensionEntry[];
  components: ResolvedExtensionComponent[];
  searchers: ResolvedSearcherComponent[];
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
  const searchers: ResolvedSearcherComponent[] = [];
  for (const component of file.components) {
    if (!component.enabled) continue;
    const extension = enabledExtensions.get(component.extensionId);
    if (!extension) continue;
    if (component.kind === "page-block") {
      components.push(toResolvedComponent(component, extension));
    } else if (component.kind === "searcher") {
      searchers.push(toResolvedSearcher(component, extension));
    }
  }

  return {
    extensions: [...enabledExtensions.values()],
    components,
    searchers,
  };
}

function extensionPick(extension: ExtensionEntry) {
  return {
    id: extension.id,
    editorModule: extension.editorModule,
    htmlModule: extension.htmlModule,
    serverModule: extension.serverModule,
    searcherModule: extension.searcherModule,
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
    extension: extensionPick(extension),
  };
}

function toResolvedSearcher(
  component: ExtensionComponentEntry,
  extension: ExtensionEntry,
): ResolvedSearcherComponent {
  return {
    id: component.id,
    extensionId: component.extensionId,
    implementationId: component.implementationId,
    label: component.label,
    kind: "searcher",
    params: mergeParams(extension.params, component.params),
    extension: extensionPick(extension),
  };
}

export function findComponentById(
  manifest: ExtensionsManifest,
  componentId: string,
): ResolvedExtensionComponent | undefined {
  return manifest.components.find((component) => component.id === componentId);
}

export function findSearcherById(
  manifest: ExtensionsManifest,
  componentId: string,
): ResolvedSearcherComponent | undefined {
  return manifest.searchers.find((component) => component.id === componentId);
}
