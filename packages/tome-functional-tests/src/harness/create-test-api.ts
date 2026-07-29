import { join } from "node:path";
import { createApiHandler, UserSettingsStore, type ApiFetchHandler } from "tome-http";
import { openTomeGraphServices } from "tome-server";
import type { TestContentFixture } from "tome-db/content/test-helpers";
import type { TomeGraphServices } from "tome-graph-interfaces";

export function createTestApi(options: {
  dbPath: string;
  contentDir: string;
  settingsPath?: string;
}): { handler: ApiFetchHandler; services: TomeGraphServices } {
  const services = openTomeGraphServices(options.dbPath, options.contentDir);
  const settingsPath = options.settingsPath ?? join(options.dbPath, "..", "user-settings.json");
  const handler = createApiHandler(services, new UserSettingsStore(settingsPath));
  const prevClose = handler.close;
  handler.close = () => {
    prevClose();
    services.close();
  };
  return { handler, services };
}

/** In-process API over a content fixture (full rebuild + local SQLite). */
export function createTestApiFromContent(fixture: TestContentFixture) {
  fixture.ctx.sync.fullRebuild();
  const dbPath = join(fixture.tempDir, "api.sqlite");
  const settingsPath = join(fixture.tempDir, "user-settings.json");
  return {
    ...createTestApi({ dbPath, contentDir: fixture.ctx.store.contentDir, settingsPath }),
    dbPath,
  };
}
