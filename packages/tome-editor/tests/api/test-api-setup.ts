import { join } from "node:path";
import { createApiHandler } from "../../src/api/server";
import type { TestContentFixture } from "tome-db/content/test-helpers";

export function createTestApiFromContent(fixture: TestContentFixture) {
  fixture.ctx.sync.fullRebuild();
  const dbPath = join(fixture.tempDir, "api.sqlite");
  const handler = createApiHandler(dbPath, undefined, fixture.ctx.store.contentDir);
  return { handler, dbPath };
}
