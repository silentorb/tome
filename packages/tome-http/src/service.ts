import { resolve } from "node:path";
import type { TomeServiceHost, TomeServiceModule } from "tome-service-interfaces";
import { createApiHandler, type ApiFetchHandler } from "./handler";
import { UserSettingsStore } from "./user-settings-store";

const DEFAULT_PORT = 3847;

export interface TomeHttpServiceOptions {
  port?: number;
  /** Absolute or CWD-relative path to user settings JSON. */
  userSettingsPath?: string;
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

function parseOptions(raw: unknown): TomeHttpServiceOptions {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    port: typeof o.port === "number" ? o.port : undefined,
    userSettingsPath: typeof o.userSettingsPath === "string" ? o.userSettingsPath : undefined,
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
      handler = createApiHandler(host.services, settingsStore);
      server = Bun.serve({
        port,
        fetch: handler,
      });
      console.log(`Tome API listening on http://127.0.0.1:${port}`);
    },
    stop() {
      handler?.close();
      handler = null;
      server?.stop(true);
      server = null;
    },
  };
}
