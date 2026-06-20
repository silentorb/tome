export const EXTENSIONS_FILE_VERSION = 1;

export type ExtensionComponentKind = "page-block";

export interface ExtensionSlashMenuConfig {
  group?: string;
  order?: number;
}

export interface ExtensionEntry {
  id: string;
  label?: string;
  enabled: boolean;
  editorModule?: string;
  htmlModule?: string;
  serverModule?: string;
  params?: Record<string, unknown>;
}

export interface ExtensionComponentEntry {
  id: string;
  extensionId: string;
  kind: ExtensionComponentKind;
  implementationId: string;
  label: string;
  enabled: boolean;
  slashMenu?: ExtensionSlashMenuConfig;
  params?: Record<string, unknown>;
}

export interface ExtensionsFile {
  version: number;
  extensions: ExtensionEntry[];
  components: ExtensionComponentEntry[];
}

function parseRequiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path}: must be a non-empty string`);
  }
  return value.trim();
}

function parseOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return parseRequiredString(value, path);
}

function parseBoolean(value: unknown, path: string, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") {
    throw new Error(`${path}: must be a boolean`);
  }
  return value;
}

function parseParams(value: unknown, path: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseExtensionEntry(raw: unknown, path: string): ExtensionEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const entry: ExtensionEntry = {
    id: parseRequiredString(obj.id, `${path}.id`),
    enabled: parseBoolean(obj.enabled, `${path}.enabled`, true),
  };
  const label = parseOptionalString(obj.label, `${path}.label`);
  if (label) entry.label = label;
  const editorModule = parseOptionalString(obj.editorModule, `${path}.editorModule`);
  if (editorModule) entry.editorModule = editorModule;
  const htmlModule = parseOptionalString(obj.htmlModule, `${path}.htmlModule`);
  if (htmlModule) entry.htmlModule = htmlModule;
  const serverModule = parseOptionalString(obj.serverModule, `${path}.serverModule`);
  if (serverModule) entry.serverModule = serverModule;
  const params = parseParams(obj.params, `${path}.params`);
  if (params) entry.params = params;
  return entry;
}

function parseComponentKind(value: unknown, path: string): ExtensionComponentKind {
  const kind = parseRequiredString(value, path);
  if (kind !== "page-block") {
    throw new Error(`${path}: unsupported kind "${kind}"`);
  }
  return kind;
}

function parseSlashMenu(raw: unknown, path: string): ExtensionSlashMenuConfig | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const menu: ExtensionSlashMenuConfig = {};
  const group = parseOptionalString(obj.group, `${path}.group`);
  if (group) menu.group = group;
  if (obj.order !== undefined) {
    if (typeof obj.order !== "number" || !Number.isFinite(obj.order)) {
      throw new Error(`${path}.order: must be a number`);
    }
    menu.order = obj.order;
  }
  return menu;
}

function parseComponentEntry(raw: unknown, path: string): ExtensionComponentEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const entry: ExtensionComponentEntry = {
    id: parseRequiredString(obj.id, `${path}.id`),
    extensionId: parseRequiredString(obj.extensionId, `${path}.extensionId`),
    kind: parseComponentKind(obj.kind, `${path}.kind`),
    implementationId: parseRequiredString(obj.implementationId, `${path}.implementationId`),
    label: parseRequiredString(obj.label, `${path}.label`),
    enabled: parseBoolean(obj.enabled, `${path}.enabled`, true),
  };
  const slashMenu = parseSlashMenu(obj.slashMenu, `${path}.slashMenu`);
  if (slashMenu) entry.slashMenu = slashMenu;
  const params = parseParams(obj.params, `${path}.params`);
  if (params) entry.params = params;
  return entry;
}

export function emptyExtensionsFile(): ExtensionsFile {
  return { version: EXTENSIONS_FILE_VERSION, extensions: [], components: [] };
}

export function parseExtensionsFile(raw: string): ExtensionsFile {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("extensions.json: root must be an object");
  }
  const obj = parsed as Record<string, unknown>;
  const version =
    obj.version === undefined ? EXTENSIONS_FILE_VERSION : Number(obj.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("extensions.json: version must be a positive integer");
  }
  if (!Array.isArray(obj.extensions)) {
    throw new Error("extensions.json: extensions must be an array");
  }
  if (!Array.isArray(obj.components)) {
    throw new Error("extensions.json: components must be an array");
  }
  return {
    version,
    extensions: obj.extensions.map((entry, index) =>
      parseExtensionEntry(entry, `extensions[${index}]`),
    ),
    components: obj.components.map((entry, index) =>
      parseComponentEntry(entry, `components[${index}]`),
    ),
  };
}

export function serializeExtensionsFile(file: ExtensionsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
