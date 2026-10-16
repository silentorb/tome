import type { PageBlockComponentRef } from "tome-interfaces/page-block";
import type {
  ExtensionComponentEntry,
  ExtensionEntry,
  ExtensionsFile,
  ExtensionsSearchRoleMap,
} from "./extensions-file";

type ExtensionModulePick = Pick<
  ExtensionEntry,
  | "id"
  | "editorModule"
  | "htmlModule"
  | "serverModule"
  | "searcherModule"
  | "authenticationModule"
>;

export interface ResolvedExtensionComponent extends PageBlockComponentRef {
  kind: "page-block";
  /** Roles this component fulfills (fence `type=`). Always non-empty. */
  roles: string[];
  slashMenu?: { group?: string; order?: number };
  extension: ExtensionModulePick;
}

export interface ResolvedSearcherComponent {
  id: string;
  extensionId: string;
  implementationId: string;
  label: string;
  kind: "searcher";
  params: Record<string, unknown>;
  extension: ExtensionModulePick;
}

export interface ResolvedAuthenticationProviderComponent {
  id: string;
  extensionId: string;
  implementationId: string;
  label: string;
  kind: "authentication-provider";
  params: Record<string, unknown>;
  extension: ExtensionModulePick;
}

export interface ExtensionsManifest {
  extensions: ExtensionEntry[];
  components: ResolvedExtensionComponent[];
  searchers: ResolvedSearcherComponent[];
  /**
   * Role → enabled searcher component id.
   * Null when no searchers / no binding.
   */
  search: ExtensionsSearchRoleMap | null;
  /**
   * At most one enabled authentication-provider.
   * Null when none configured.
   */
  authenticationProvider: ResolvedAuthenticationProviderComponent | null;
}

function mergeParams(
  extensionParams: Record<string, unknown> | undefined,
  componentParams: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...extensionParams, ...componentParams };
}

/**
 * Resolve role → component id bindings.
 * - Explicit `file.search`: both roles required; ids must be enabled searchers.
 * - Omitted `search` + exactly one enabled searcher: bind both roles to it.
 * - Omitted `search` + zero searchers: null.
 * - Omitted `search` + multiple searchers: error (ambiguous).
 */
export function resolveSearchRoleMap(
  fileSearch: ExtensionsSearchRoleMap | undefined,
  searchers: readonly ResolvedSearcherComponent[],
): ExtensionsSearchRoleMap | null {
  const byId = new Map(searchers.map((s) => [s.id, s]));

  if (fileSearch) {
    for (const [role, componentId] of Object.entries(fileSearch) as [
      keyof ExtensionsSearchRoleMap,
      string,
    ][]) {
      if (!byId.has(componentId)) {
        throw new Error(
          `extensions.json.search.${role}: "${componentId}" is not an enabled searcher`,
        );
      }
    }
    return { title: fileSearch.title, content: fileSearch.content };
  }

  if (searchers.length === 0) return null;
  if (searchers.length === 1) {
    const id = searchers[0]!.id;
    return { title: id, content: id };
  }
  const ids = searchers.map((s) => s.id).join(", ");
  throw new Error(
    `extensions.json.search is required when multiple searchers are enabled (${ids})`,
  );
}

/**
 * Zero or one enabled authentication-provider.
 * Multiple enabled providers are an error (ambiguous).
 */
export function resolveAuthenticationProvider(
  providers: readonly ResolvedAuthenticationProviderComponent[],
): ResolvedAuthenticationProviderComponent | null {
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0]!;
  const ids = providers.map((p) => p.id).join(", ");
  throw new Error(
    `extensions.json: at most one authentication-provider may be enabled (${ids})`,
  );
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
  const authenticationProviders: ResolvedAuthenticationProviderComponent[] = [];
  for (const component of file.components) {
    if (!component.enabled) continue;
    const extension = enabledExtensions.get(component.extensionId);
    if (!extension) continue;
    if (component.kind === "page-block") {
      components.push(toResolvedComponent(component, extension));
    } else if (component.kind === "searcher") {
      searchers.push(toResolvedSearcher(component, extension));
    } else if (component.kind === "authentication-provider") {
      authenticationProviders.push(toResolvedAuthenticationProvider(component, extension));
    }
  }

  const search = resolveSearchRoleMap(file.search, searchers);
  const authenticationProvider = resolveAuthenticationProvider(authenticationProviders);

  return {
    extensions: [...enabledExtensions.values()],
    components,
    searchers,
    search,
    authenticationProvider,
  };
}

function extensionPick(extension: ExtensionEntry): ExtensionModulePick {
  return {
    id: extension.id,
    editorModule: extension.editorModule,
    htmlModule: extension.htmlModule,
    serverModule: extension.serverModule,
    searcherModule: extension.searcherModule,
    authenticationModule: extension.authenticationModule,
  };
}

function toResolvedComponent(
  component: ExtensionComponentEntry,
  extension: ExtensionEntry,
): ResolvedExtensionComponent {
  const roles =
    component.roles && component.roles.length > 0 ? [...component.roles] : [component.id];
  return {
    id: component.id,
    extensionId: component.extensionId,
    implementationId: component.implementationId,
    label: component.label,
    kind: "page-block",
    roles,
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

function toResolvedAuthenticationProvider(
  component: ExtensionComponentEntry,
  extension: ExtensionEntry,
): ResolvedAuthenticationProviderComponent {
  return {
    id: component.id,
    extensionId: component.extensionId,
    implementationId: component.implementationId,
    label: component.label,
    kind: "authentication-provider",
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

/**
 * Resolve a page-block fence role to a provider component.
 * First matching `roles` entry in `components[]` order wins; else match by component id.
 */
export function resolvePageBlockRole(
  manifest: ExtensionsManifest,
  role: string,
): ResolvedExtensionComponent | undefined {
  const trimmed = role.trim();
  if (!trimmed) return undefined;
  const byRole = manifest.components.find((component) => component.roles.includes(trimmed));
  if (byRole) return byRole;
  return findComponentById(manifest, trimmed);
}

export function findSearcherById(
  manifest: ExtensionsManifest,
  componentId: string,
): ResolvedSearcherComponent | undefined {
  return manifest.searchers.find((component) => component.id === componentId);
}
