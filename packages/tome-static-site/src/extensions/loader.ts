import { existsSync, statSync } from "node:fs";
import { extensionsFilePath } from "tome-db/content";
import { loadExtensionsFromContent, resolveExtensionsManifest } from "tome-db";
import type { HtmlPageBlockModule } from "tome-interfaces/page-block/html";
import type { ResolvedExtensionComponent } from "tome-db";
import { HtmlPageBlockHostImpl } from "./html-host";

async function importHtmlModule(modulePath: string, host: HtmlPageBlockHostImpl): Promise<void> {
  const loaded = (await import(modulePath)) as {
    register?: HtmlPageBlockModule["register"];
    default?: { register?: HtmlPageBlockModule["register"] };
  };
  const register = loaded.register ?? loaded.default?.register;
  if (typeof register !== "function") {
    throw new Error(`Extension html module ${modulePath} must export register(host)`);
  }
  register(host);
}

export class ExtensionHtmlRuntime {
  readonly #contentDir: string;
  readonly #host = new HtmlPageBlockHostImpl();
  #components: ResolvedExtensionComponent[] = [];
  #lastConfigMtime = -1;

  constructor(contentDir: string) {
    this.#contentDir = contentDir;
  }

  get host(): HtmlPageBlockHostImpl {
    return this.#host;
  }

  get components(): ResolvedExtensionComponent[] {
    return this.#components;
  }

  configMtime(): number {
    const path = extensionsFilePath(this.#contentDir);
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
    const file = loadExtensionsFromContent(this.#contentDir);
    const manifest = resolveExtensionsManifest(file);
    this.#components = manifest.components;
    this.#host.clear();

    const loadedExtensionIds = new Set<string>();
    for (const extension of manifest.extensions) {
      if (!extension.htmlModule || loadedExtensionIds.has(extension.id)) continue;
      loadedExtensionIds.add(extension.id);
      await importHtmlModule(extension.htmlModule, this.#host);
    }
  }
}
