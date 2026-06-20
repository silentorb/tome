import { existsSync, statSync } from "node:fs";
import { extensionsFilePath } from "tome-db/content";
import type { EditorPageBlockModule } from "tome-interfaces/page-block/editor";
import type { ServerPageBlockModule } from "tome-interfaces/page-block/server";
import {
  findComponentById,
  loadExtensionsFromContent,
  resolveExtensionsManifest,
  type ExtensionsManifest,
  type ResolvedExtensionComponent,
} from "tome-db";
import { EditorPageBlockHostImpl, ServerPageBlockHostImpl } from "./hosts";
import type { PublicExtensionsManifest } from "../../shared/extensions";

export type { PublicExtensionsManifest };

export interface LoadedExtensionModules {
  extensionId: string;
  editorModule?: string;
  htmlModule?: string;
  serverModule?: string;
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
  readonly #editorHost = new EditorPageBlockHostImpl();
  readonly #serverHost = new ServerPageBlockHostImpl();
  #manifest: ExtensionsManifest = { extensions: [], components: [] };
  #loadedModules: LoadedExtensionModules[] = [];
  #lastConfigMtime = -1;

  constructor(contentPath: string) {
    this.#contentPath = contentPath;
  }

  get editorHost(): EditorPageBlockHostImpl {
    return this.#editorHost;
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
    this.#serverHost.clear();
    this.#loadedModules = [];

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
      if (extension.serverModule) {
        await importServerModule(extension.serverModule, this.#serverHost);
      }
    }
  }

  getPublicManifest(apiBase = "/api"): PublicExtensionsManifest {
    return {
      components: this.#manifest.components.map((component) => ({
        id: component.id,
        extensionId: component.extensionId,
        implementationId: component.implementationId,
        label: component.label,
        slashMenu: component.slashMenu,
      })),
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
        services: {},
      },
      input,
    );
    return { ok: true, data };
  }

  async bundleEditorModule(extensionId: string): Promise<string | null> {
    const extension = this.#manifest.extensions.find((entry) => entry.id === extensionId);
    if (!extension?.editorModule) return null;

    const result = await Bun.build({
      entrypoints: [extension.editorModule],
      target: "browser",
      format: "esm",
      external: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    });
    if (!result.success || result.outputs.length === 0) {
      throw new Error(
        result.logs.map((log) => log.message).join("\n") || "Failed to bundle editor extension",
      );
    }
    return await result.outputs[0]!.text();
  }
}
