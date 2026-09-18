import { resolve } from "node:path";
import type { TomeServiceHost, TomeServiceModule } from "tome-service-interfaces";
import {
  configureProfiling,
  ensureProfilingStore,
  openProfilingStore,
  resolveProfilingFromEnv,
} from "tome-service-interfaces";
import { createApiHandler, type ApiFetchHandler } from "./handler";
import { UserSettingsStore } from "./user-settings-store";

const DEFAULT_PORT = 3847;

export interface TomeHttpServiceOptions {
  port?: number;
  /** Absolute or CWD-relative path to user settings JSON. */
  userSettingsPath?: string;
  /** Opt-in API/SQL profiling (`true` / `"verbose"`). Env: `TOME_PROFILING`. */
  profiling?: boolean | "verbose";
  /** Slow-sample threshold in ms (default 100). Env: `TOME_PROFILING_SLOW_MS`. */
  slowMs?: number;
  /**
   * Cache SQLite path used to derive neighboring `tome-profiling.sqlite`
   * when `TOME_PROFILING_DB_PATH` is unset.
   */
  cacheDbPath?: string;
  /** Explicit profiling DB path (wins over neighbor derivation when set here; env still wins inside resolve). */
  profilingDbPath?: string;
}

function readEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function resolvePort(options: TomeHttpServiceOptions): number {
  if (typeof options.port === "number" && Number.isFinite(options.port)) {
    return options.port;
  }
  const raw = readEnv("TOME_EDITOR_API_PORT") ?? String(DEFAULT_PORT);
  const port = Number.parseInt(raw, 10);
  return Number.isFinite(port) ? port : DEFAULT_PORT;
}

function resolveUserSettingsPath(options: TomeHttpServiceOptions, contentHint?: string): string {
  if (options.userSettingsPath) {
    return resolve(options.userSettingsPath);
  }
  const fromEnv = readEnv("TOME_USER_SETTINGS_PATH");
  if (fromEnv) return resolve(fromEnv);
  // Default: sibling of content root when TOME_CONTENT_PATH set, else CWD/.tome
  const content = readEnv("TOME_CONTENT_PATH");
  if (content) {
    return resolve(content, "..", ".tome/user-settings.json");
  }
  if (contentHint) {
    return resolve(contentHint, "..", ".tome/user-settings.json");
  }
  return resolve(process.cwd(), ".tome/user-settings.json");
}

function parseProfilingOption(raw: unknown): boolean | "verbose" | undefined {
  if (raw === true || raw === false) return raw;
  if (raw === "verbose") return "verbose";
  return undefined;
}

function parseOptions(raw: unknown): TomeHttpServiceOptions {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    port: typeof o.port === "number" ? o.port : undefined,
    userSettingsPath: typeof o.userSettingsPath === "string" ? o.userSettingsPath : undefined,
    profiling: parseProfilingOption(o.profiling),
    slowMs: typeof o.slowMs === "number" ? o.slowMs : undefined,
    cacheDbPath: typeof o.cacheDbPath === "string" ? o.cacheDbPath : undefined,
    profilingDbPath: typeof o.profilingDbPath === "string" ? o.profilingDbPath : undefined,
  };
}

/**
 * Factory for `tome-server.json` (`export`: `createTomeHttpService`).
 */
export function createTomeHttpService(): TomeServiceModule {
  let server: ReturnType<typeof Bun.serve> | null = null;
  let handler: ApiFetchHandler | null = null;

  return {
    id: "http",
    async start(host: TomeServiceHost) {
      const options = parseOptions(host.options);
      const port = resolvePort(options);
      const settingsPath = resolveUserSettingsPath(options);
      const settingsStore = new UserSettingsStore(settingsPath);
      const profilingConfig = resolveProfilingFromEnv({
        profiling: options.profiling,
        slowMs: options.slowMs,
      });
      configureProfiling(profilingConfig);
      if (profilingConfig.enabled) {
        if (options.profilingDbPath) {
          openProfilingStore(resolve(options.profilingDbPath));
        } else {
          ensureProfilingStore(options.cacheDbPath);
        }
      }
      handler = createApiHandler(host.services, settingsStore, {
        getCacheSyncStatus: host.getCacheSyncStatus,
      });
      server = Bun.serve({
        port,
        fetch: handler,
      });
      console.log(`Tome API listening on http://127.0.0.1:${port}`);
      if (profilingConfig.enabled) {
        console.log(
          `[tome-http] profiling enabled (slowMs=${profilingConfig.slowMs}${profilingConfig.verbose ? ", verbose" : ""}; maxMb=${profilingConfig.maxMb})`,
        );
      }
    },
    stop() {
      handler?.close();
      handler = null;
      server?.stop(true);
      server = null;
    },
  };
}
