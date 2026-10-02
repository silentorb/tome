import { join } from "node:path";
import { createApiHandler, UserSettingsStore, type ApiFetchHandler } from "tome-http";
import { openTomeGraphServices } from "../../src/graph-services";
import type { TestContentFixture } from "tome-db/content/test-helpers";
import type { TomeGraphServices } from "tome-graph-interfaces";

export async function createTestApi(options: {
  dbPath: string;
  contentDir: string;
  settingsPath?: string;
}): Promise<{ handler: ApiFetchHandler; services: TomeGraphServices }> {
  const services = await openTomeGraphServices(options.dbPath, options.contentDir);
  const settingsPath = options.settingsPath ?? join(options.dbPath, "..", "user-settings.json");
  const handler = createApiHandler(services, new UserSettingsStore(settingsPath));
  const prevClose = handler.close;
  handler.close = async () => {
    await prevClose();
    await services.close();
  };
  return { handler, services };
}

export async function createTestApiFromContent(fixture: TestContentFixture) {
  await fixture.ctx.sync.fullRebuild();
  const dbPath = join(fixture.tempDir, "api.sqlite");
  const settingsPath = join(fixture.tempDir, "user-settings.json");
  return {
    ...(await createTestApi({
      dbPath,
      contentDir: fixture.ctx.store.contentDir,
      settingsPath,
    })),
    dbPath,
  };
}
