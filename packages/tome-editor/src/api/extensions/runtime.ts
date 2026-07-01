import { existsSync, statSync } from "node:fs";
import { extensionsFilePath } from "tome-db/content";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionSchemaQueryServices } from "tome-interfaces/extension-services/schema-query";
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
import { prepareEditorBodyWithPageBlocks } from "./page-block-markdown";
import { resolveExtensionModulePath } from "./resolve-extension-module";
import type { PublicExtensionsManifest } from "../../shared/extensions";

export type { PublicExtensionsManifest };

export interface LoadedExtensionModules {
  extensionId: string;
  editorModule?: string;
  htmlModule?: string;
  serverModule?: string;
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

export class ExtensionServerRuntime {
  readonly #contentPath: string;
  readonly #getGraphQueryServices?: () => ExtensionGraphQueryServices | undefined;
  readonly #getSchemaQueryServices?: () => ExtensionSchemaQueryServices | undefined;
  readonly #editorHost = new EditorPageBlockHostImpl();
  readonly #htmlHost = new HtmlPageBlockHostImpl();
  readonly #serverHost = new ServerPageBlockHostImpl();
  #manifest: ExtensionsManifest = { extensions: [], components: [] };
  #loadedModules: LoadedExtensionModules[] = [];
  #lastConfigMtime = -1;

  constructor(
    contentPath: string,
    getGraphQueryServices?: () => ExtensionGraphQueryServices | undefined,
    getSchemaQueryServices?: () => ExtensionSchemaQueryServices | undefined,
  ) {
    this.#contentPath = contentPath;
    this.#getGraphQueryServices = getGraphQueryServices;
    this.#getSchemaQueryServices = getSchemaQueryServices;
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
    this.#lastConfigMtime = mtime;
    await this.reload();
  }

  async reload(): Promise<void> {
    const file = loadExtensionsFromContent(this.#contentPath);
    this.#manifest = resolveExtensionsManifest(file);
    this.#editorHost.clear();
    this.#htmlHost.clear();
    this.#serverHost.clear();
    this.#loadedModules = [];

    const loadedHtmlExtensionIds = new Set<string>();
    for (const extension of this.#manifest.extensions) {
      const record: LoadedExtensionModules = {
        extensionId: extension.id,
        editorModule: extension.editorModule,
        htmlModule: extension.htmlModule,
        serverModule: extension.serverModule,
      };
      this.#loadedModules.push(record);

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
    const result = await Bun.build({
      entrypoints: [entrypoint],
      target: "browser",
      format: "esm",
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      jsx: {
        runtime: "automatic",
        importSource: "react",
        development: false,
      },
      external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    });
    if (!result.success || result.outputs.length === 0) {
      throw new Error(
        result.logs.map((log) => log.message).join("\n") || "Failed to bundle editor extension",
      );
    }
    return await result.outputs[0]!.text();
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
      scale ? { nodeDimensionScale: scale } : undefined,
      schemaDiagram,
    );
  }
}
