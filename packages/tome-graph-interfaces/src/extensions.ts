export interface PublicExtensionComponent {
  id: string;
  extensionId: string;
  implementationId: string;
  label: string;
  /** Page-block roles this component fulfills (fence `type=`). */
  roles: string[];
  slashMenu?: { group?: string; order?: number };
  /** When true, the editor mounts the extension React Component for this block. */
  interactive?: boolean;
  insertDefaultData?: unknown;
}

export interface PublicExtensionsManifest {
  components: PublicExtensionComponent[];
  editorBundles: Array<{ extensionId: string; url: string }>;
}
