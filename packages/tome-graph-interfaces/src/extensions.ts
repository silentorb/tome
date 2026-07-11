export interface PublicExtensionComponent {
  id: string;
  extensionId: string;
  implementationId: string;
  label: string;
  slashMenu?: { group?: string; order?: number };
  insertDefaultData?: unknown;
}

export interface PublicExtensionsManifest {
  components: PublicExtensionComponent[];
  editorBundles: Array<{ extensionId: string; url: string }>;
}
