import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  applyUserSettingsPatch,
  emptyUserSettings,
  parseUserSettings,
  type UserSettings,
  type UserSettingsPatch,
} from "../shared/user-settings";
import { resolveUserSettingsPath } from "./paths";

export class UserSettingsStore {
  private readonly path: string;
  private cached: UserSettings | null = null;

  constructor(path = resolveUserSettingsPath()) {
    this.path = path;
  }

  getPath(): string {
    return this.path;
  }

  read(): UserSettings {
    if (this.cached) return this.cached;

    if (!existsSync(this.path)) {
      this.cached = emptyUserSettings();
      return this.cached;
    }

    try {
      const raw = readFileSync(this.path, "utf8");
      this.cached = parseUserSettings(JSON.parse(raw));
      return this.cached;
    } catch {
      this.cached = emptyUserSettings();
      return this.cached;
    }
  }

  patch(patch: UserSettingsPatch): UserSettings {
    const current = this.read();
    const next = applyUserSettingsPatch(current, patch);
    this.write(next);
    return next;
  }

  write(settings: UserSettings): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const payload = `${JSON.stringify(settings, null, 2)}\n`;
    const tempPath = `${this.path}.tmp`;
    writeFileSync(tempPath, payload, "utf8");
    renameSync(tempPath, this.path);
    this.cached = settings;
  }
}
