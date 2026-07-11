import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  TomeServerConfig,
  TomeServerServiceConfigEntry,
  TomeServiceModule,
  TomeServiceModuleFactory,
} from "tome-service-interfaces";
import type { TomeGraphServices } from "tome-graph-interfaces";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = resolve(moduleDir, "../config/tome-server.json");

function readEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function resolveServerConfigPath(): string {
  const fromEnv = readEnv("TOME_SERVER_CONFIG");
  if (fromEnv) return resolve(fromEnv);
  return DEFAULT_CONFIG_PATH;
}

export function parseServerConfig(raw: unknown): TomeServerConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("tome-server config: root must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const version = obj.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error("tome-server config: version must be a positive integer");
  }
  const servicesRaw = obj.services;
  if (!Array.isArray(servicesRaw)) {
    throw new Error("tome-server config: services must be an array");
  }
  const services: TomeServerServiceConfigEntry[] = servicesRaw.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`tome-server config: services[${index}] must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id.trim()) {
      throw new Error(`tome-server config: services[${index}].id required`);
    }
    if (typeof e.module !== "string" || !e.module.trim()) {
      throw new Error(`tome-server config: services[${index}].module required`);
    }
    if (typeof e.export !== "string" || !e.export.trim()) {
      throw new Error(`tome-server config: services[${index}].export required`);
    }
    return {
      id: e.id.trim(),
      module: e.module.trim(),
      export: e.export.trim(),
      options: e.options,
    };
  });
  return { version, services };
}

export function loadServerConfig(path = resolveServerConfigPath()): TomeServerConfig {
  if (!existsSync(path)) {
    throw new Error(`tome-server config not found: ${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return parseServerConfig(raw);
}

async function loadServiceModule(entry: TomeServerServiceConfigEntry): Promise<TomeServiceModule> {
  const mod = (await import(entry.module)) as Record<string, unknown>;
  const factory = mod[entry.export];
  if (typeof factory !== "function") {
    throw new Error(
      `tome-server: ${entry.module} export "${entry.export}" is not a function`,
    );
  }
  const created = (factory as TomeServiceModuleFactory)();
  if (!created || typeof created.start !== "function") {
    throw new Error(
      `tome-server: ${entry.module}.${entry.export}() did not return a TomeServiceModule`,
    );
  }
  // Prefer config id when provided
  return { ...created, id: entry.id || created.id };
}

export interface StartedServices {
  modules: TomeServiceModule[];
  stop(): Promise<void>;
}

export async function startConfiguredServices(
  graph: TomeGraphServices,
  config: TomeServerConfig = loadServerConfig(),
): Promise<StartedServices> {
  if (config.services.length === 0) {
    console.warn(
      "[tome-server] no service modules configured (services: []); host is running without remotes",
    );
  }

  const modules: TomeServiceModule[] = [];
  for (const entry of config.services) {
    const service = await loadServiceModule(entry);
    await service.start({
      services: graph,
      options: entry.options ?? {},
    });
    modules.push(service);
    console.log(`[tome-server] started service "${service.id}" from ${entry.module}`);
  }

  return {
    modules,
    async stop() {
      for (const mod of [...modules].reverse()) {
        await mod.stop?.();
      }
    },
  };
}
