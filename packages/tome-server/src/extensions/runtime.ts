import { existsSync, statSync } from "node:fs";
import { extensionsFilePath } from "tome-db/content";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionSchemaQueryServices } from "tome-interfaces/extension-services/schema-query";
import type { ExtensionSqlQueryServices } from "tome-interfaces/extension-services/sql-query";
import type { EditorPageBlockModule } from "tome-interfaces/page-block/editor";
import type { HtmlPageBlockModule } from "tome-interfaces/page-block/html";
import type { ServerPageBlockModule } from "tome-interfaces/page-block/server";
import {
  findComponentById,
  loadExtensionsFromContent,
  loadWorkspaceFromContent,
  resolveExtensionsManifest,
  spatialGraphNodeDimensionScale,
  schemaDiagramPageBlockServices,
  type ExtensionsManifest,
  type ResolvedExtensionComponent,
} from "tome-db";
import { EditorPageBlockHostImpl, ServerPageBlockHostImpl } from "./hosts";
import { HtmlPageBlockHostImpl } from "./html-host";
import {
  prepareEditorBodyWithPageBlocks,
  renderPageBlockHtmlForEditor,
} from "./page-block-markdown";
import { buildEditorBundleInSubprocess } from "./build-editor-bundle";
import { resolveExtensionModulePath } from "./resolve-extension-module";
import { editorBundleWatchRoot, maxSourceMtimeMs } from "./editor-bundle-mtime";
import type { PublicExtensionsManifest } from "tome-graph-interfaces";

export type { PublicExtensionsManifest };

export interface LoadedExtensionModules {
  extensionId: string;
  editorModule?: string;
  htmlModule?: string;
  serverModule?: string;
}

interface CachedEditorBundle {
  js: string;
  sourceMtimeMs: number;
}

async function importHtmlModule(modulePath: string, host: HtmlPageBlockHostImpl): Promise<void> {
  const loaded = (await import(modulePath)) as HtmlPageBlockModule & {
    default?: HtmlPageBlockModule;
  };
  const register = loaded.register ?? loaded.default?.register;
  if (typeof register !== "function") {
    throw new Error(`Extension module ${modulePath} must export register(host)`);
  }
  register(host);
}

async function importEditorModule(modulePath: string, host: EditorPageBlockHostImpl): Promise<void> {
  const loaded = (await import(modulePath)) as EditorPageBlockModule & {
    default?: EditorPageBlockModule;
  };
  const register = loaded.register ?? loaded.default?.register;
  if (typeof register !== "function") {
    throw new Error(`Extension module ${modulePath} must export register(host)`);
  }
  register(host);
}

async function importServerModule(modulePath: string, host: ServerPageBlockHostImpl): Promise<void> {
  const loaded = (await import(modulePath)) as ServerPageBlockModule & {
    default?: ServerPageBlockModule;
  };
  const register = loaded.register ?? loaded.default?.register;
  if (typeof register !== "function") {
    throw new Error(`Extension module ${modulePath} must export register(host)`);
  }
  register(host);
}

/** Serialize Bun.build across extensions — concurrent builds are flaky in long-lived server processes. */
let editorBuildChain: Promise<unknown> = Promise.resolve();

function enqueueEditorBuild<T>(fn: () => Promise<T>): Promise<T> {
  const run = editorBuildChain.then(fn, fn);
  editorBuildChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export class ExtensionServerRuntime {
  readonly #contentPath: string;
  readonly #getGraphQueryServices?: () => ExtensionGraphQueryServices | undefined;
  readonly #getSchemaQueryServices?: () => ExtensionSchemaQueryServices | undefined;
  readonly #getSqlQueryServices?: () => ExtensionSqlQueryServices | undefined;
  readonly #editorHost = new EditorPageBlockHostImpl();
  readonly #htmlHost = new HtmlPageBlockHostImpl();
  readonly #serverHost = new ServerPageBlockHostImpl();
  readonly #editorBundleCache = new Map<string, CachedEditorBundle>();
  readonly #editorBundleInflight = new Map<string, Promise<string | null>>();
  #manifest: ExtensionsManifest = { extensions: [], components: [] };
  #loadedModules: LoadedExtensionModules[] = [];
  #lastConfigMtime = -1;

  constructor(
    contentPath: string,
    getGraphQueryServices?: () => ExtensionGraphQueryServices | undefined,
    getSchemaQueryServices?: () => ExtensionSchemaQueryServices | undefined,
    getSqlQueryServices?: () => ExtensionSqlQueryServices | undefined,
  ) {
    this.#contentPath = contentPath;
    this.#getGraphQueryServices = getGraphQueryServices;
    this.#getSchemaQueryServices = getSchemaQueryServices;
    this.#getSqlQueryServices = getSqlQueryServices;
  }

  get editorHost(): EditorPageBlockHostImpl {
    return this.#editorHost;
  }

  get htmlHost(): HtmlPageBlockHostImpl {
    return this.#htmlHost;
  }

  get manifest(): ExtensionsManifest {
    return this.#manifest;
  }

  configMtime(): number {
    const path = extensionsFilePath(this.#contentPath);
    if (!existsSync(path)) return 0;
    return statSync(path).mtimeMs;
  }

  async ensureLoaded(): Promise<void> {
    const mtime = this.configMtime();
    if (mtime === this.#lastConfigMtime) return;
    // Only advance mtime after a successful reload so a failed load can retry.
    await this.reload();
    this.#lastConfigMtime = mtime;
  }

  async reload(): Promise<void> {
    const file = loadExtensionsFromContent(this.#contentPath);
    this.#manifest = resolveExtensionsManifest(file);
    this.#editorHost.clear();
    this.#htmlHost.clear();
    this.#serverHost.clear();
    this.#editorBundleCache.clear();
    this.#editorBundleInflight.clear();
    this.#loadedModules = [];

    const loadedHtmlExtensionIds = new Set<string>();
    const loadErrors: string[] = [];
    for (const extension of this.#manifest.extensions) {
      const record: LoadedExtensionModules = {
        extensionId: extension.id,
        editorModule: extension.editorModule,
        htmlModule: extension.htmlModule,
        serverModule: extension.serverModule,
      };
      this.#loadedModules.push(record);

      try {
        if (extension.editorModule) {
          await importEditorModule(extension.editorModule, this.#editorHost);
        }
        if (extension.htmlModule && !loadedHtmlExtensionIds.has(extension.id)) {
          loadedHtmlExtensionIds.add(extension.id);
          await importHtmlModule(extension.htmlModule, this.#htmlHost);
        }
        if (extension.serverModule) {
          await importServerModule(extension.serverModule, this.#serverHost);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        loadErrors.push(`${extension.id}: ${message}`);
        console.error(`[tome-server] Failed to load extension ${extension.id}:`, err);
      }
    }
    if (loadErrors.length > 0 && this.#manifest.extensions.length > 0) {
      const loadedAny = this.#manifest.components.some(
        (c) =>
          this.#editorHost.get(c.implementationId) ||
          this.#htmlHost.get(c.implementationId) ||
          this.#serverHost.get(c.implementationId),
      );
      if (!loadedAny) {
        throw new Error(`All extensions failed to load:\n${loadErrors.join("\n")}`);
      }
    }
  }

  getPublicManifest(apiBase = "/api"): PublicExtensionsManifest {
    return {
      components: this.#manifest.components.map((component) => {
        const registration = this.#editorHost.get(component.implementationId);
        const insertDefaultData = registration?.insertDefaultData?.();
        return {
          id: component.id,
          extensionId: component.extensionId,
          implementationId: component.implementationId,
          label: component.label,
          slashMenu: component.slashMenu,
          ...(registration?.interactive ? { interactive: true } : {}),
          ...(insertDefaultData !== undefined ? { insertDefaultData } : {}),
        };
      }),
      editorBundles: this.#manifest.extensions
        .filter((extension) => extension.editorModule)
        .map((extension) => ({
          extensionId: extension.id,
          url: `${apiBase}/extensions/${encodeURIComponent(extension.id)}/editor.js`,
        })),
    };
  }

  findComponent(componentId: string): ResolvedExtensionComponent | undefined {
    return findComponentById(this.#manifest, componentId);
  }

  async invokeExtension(
    componentId: string,
    input: unknown,
    nodeId?: string,
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const component = this.findComponent(componentId);
    if (!component) {
      return { ok: false, error: "unknown component" };
    }
    const handler = this.#serverHost.get(component.implementationId);
    if (!handler) {
      return { ok: true, data: null };
    }
    const data = await handler.invoke(
      {
        component,
        nodeId,
        services: {
          graphQuery: this.#getGraphQueryServices?.(),
          schemaQuery: this.#getSchemaQueryServices?.(),
          sqlQuery: this.#getSqlQueryServices?.(),
        },
      },
      input,
    );
    return { ok: true, data };
  }

  async bundleEditorModule(extensionId: string): Promise<string | null> {
    const extension = this.#manifest.extensions.find((entry) => entry.id === extensionId);
    if (!extension?.editorModule) return null;

    const entrypoint = resolveExtensionModulePath(extension.editorModule, this.#contentPath);
    const sourceMtimeMs = maxSourceMtimeMs(editorBundleWatchRoot(entrypoint));

    const cached = this.#editorBundleCache.get(extensionId);
    if (cached !== undefined && cached.sourceMtimeMs === sourceMtimeMs) {
      return cached.js;
    }

    const inflight = this.#editorBundleInflight.get(extensionId);
    if (inflight) return inflight;

    const buildPromise = this.#buildEditorModule(extensionId, entrypoint, sourceMtimeMs);
    this.#editorBundleInflight.set(extensionId, buildPromise);
    try {
      return await buildPromise;
    } finally {
      this.#editorBundleInflight.delete(extensionId);
    }
  }

  async #buildEditorModule(
    extensionId: string,
    entrypoint: string,
    sourceMtimeMs: number,
  ): Promise<string | null> {
    return enqueueEditorBuild(() => this.#buildEditorModuleUnlocked(extensionId, entrypoint, sourceMtimeMs));
  }

  async #buildEditorModuleUnlocked(
    extensionId: string,
    entrypoint: string,
    sourceMtimeMs: number,
  ): Promise<string | null> {
    const built = await buildEditorBundleInSubprocess(extensionId, entrypoint);
    if (!built.ok) {
      throw new Error(`Bun.build failed for ${extensionId} (${entrypoint}): ${built.error}`);
    }
    const { js, css: cssParts } = built;
    const bundle =
      cssParts.length === 0
        ? js
        : `;(function(){var s=document.createElement("style");s.setAttribute("data-tome-ext",${JSON.stringify(extensionId)});` +
          `s.textContent=${JSON.stringify(cssParts.join("\n"))};document.head.appendChild(s);})();\n${js}`;
    this.#editorBundleCache.set(extensionId, { js: bundle, sourceMtimeMs });
    return bundle;
  }

  async prepareEditorBody(nodeId: string, body: string): Promise<string> {
    await this.ensureLoaded();
    const workspace = loadWorkspaceFromContent(this.#contentPath);
    const scale = spatialGraphNodeDimensionScale(workspace);
    const schemaDiagram = schemaDiagramPageBlockServices(workspace);
    return prepareEditorBodyWithPageBlocks(
      body,
      nodeId,
      this.#contentPath,
      this.#htmlHost,
      this.#manifest.components,
      this.#getGraphQueryServices?.(),
      this.#getSchemaQueryServices?.(),
      this.#getSqlQueryServices?.(),
      scale ? { nodeDimensionScale: scale } : undefined,
      schemaDiagram,
    );
  }

  async renderPageBlockHtml(
    nodeId: string,
    componentId: string,
    data: unknown,
  ): Promise<string> {
    await this.ensureLoaded();
    const workspace = loadWorkspaceFromContent(this.#contentPath);
    const scale = spatialGraphNodeDimensionScale(workspace);
    const schemaDiagram = schemaDiagramPageBlockServices(workspace);
    return renderPageBlockHtmlForEditor(
      nodeId,
      this.#contentPath,
      this.#htmlHost,
      this.#manifest.components,
      { componentId, data },
      this.#getGraphQueryServices?.(),
      this.#getSchemaQueryServices?.(),
      this.#getSqlQueryServices?.(),
      scale ? { nodeDimensionScale: scale } : undefined,
      schemaDiagram,
    );
  }
}
