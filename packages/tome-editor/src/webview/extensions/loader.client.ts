import type { EditorPageBlockModule } from "tome-interfaces/page-block/editor";
import type { PublicExtensionComponent, PublicExtensionsManifest } from "../../shared/extensions";
import { ClientEditorPageBlockHost } from "./client-host";

export interface LoadedClientExtensions {
  manifest: PublicExtensionsManifest;
  host: ClientEditorPageBlockHost;
  componentsById: Map<string, PublicExtensionComponent>;
}

async function loadEditorBundle(url: string, host: ClientEditorPageBlockHost): Promise<void> {
  const module = (await import(/* @vite-ignore */ url)) as {
    register?: EditorPageBlockModule["register"];
    default?: { register?: EditorPageBlockModule["register"] };
  };
  const register = module.register ?? module.default?.register;
  if (typeof register !== "function") {
    throw new Error(`Extension editor bundle ${url} must export register(host)`);
  }
  register(host);
}

export async function loadClientExtensions(
  manifest: PublicExtensionsManifest,
): Promise<LoadedClientExtensions> {
  const host = new ClientEditorPageBlockHost();
  for (const bundle of manifest.editorBundles) {
    await loadEditorBundle(bundle.url, host);
  }
  const componentsById = new Map(manifest.components.map((component) => [component.id, component]));
  return { manifest, host, componentsById };
}
