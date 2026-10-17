import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDataStoreSession } from "tome-db/sync";
import { createAuthorizationModelAuthorizer } from "tome-interfaces/authorization";
import { createCanEditNodesEvaluator } from "../src/authorization/can-edit-nodes-policy";
import {
  IDENTITY_CORPUS_ID,
  IDENTITY_CORPUS_IDS,
} from "../fixtures/identity-corpus/ids";

const identityContent = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/identity-corpus/content",
);

describe("can-edit-nodes Imp policy via shared SQLite", () => {
  let session: Awaited<ReturnType<typeof openDataStoreSession>>;
  let dbPath: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-can-edit-policy-"));
    dbPath = join(dir, "session.sqlite");
    session = await openDataStoreSession({
      dataStores: {
        identity: {
          id: IDENTITY_CORPUS_ID,
          module: "tome-flatfile",
          export: "createFlatfileModule",
          options: { contentPath: identityContent },
        },
        sqlite: {
          id: "sqlite",
          module: "tome-sqlite",
          export: "createSqliteModule",
          options: { dbPath },
        },
      },
      queryStoreId: "sqlite",
      defaultContentPath: identityContent,
      defaultDbPath: dbPath,
    });
  });

  afterAll(() => {
    session.dispose();
    rmSync(dirname(dbPath), { recursive: true, force: true });
  });

  test("Alice with grant may edit; Bob and anonymous may not", async () => {
    const evaluate = createCanEditNodesEvaluator({
      queryAll: (sql, ...params) => session.writeContext.cache.queryAll(sql, ...params),
    });
    const authorizer = createAuthorizationModelAuthorizer({
      listInstanceIds: () => ["model-1"],
      evaluateModification: evaluate,
    });

    expect(await authorizer.authorizeImpQuery(null, { graph: {} })).toBe("allow");

    expect(
      await authorizer.authorizeModification(
        { accountNodeId: IDENTITY_CORPUS_IDS.accountAlice },
        { modification: "node.patch" },
      ),
    ).toBe("allow");

    expect(
      await authorizer.authorizeModification(
        { accountNodeId: IDENTITY_CORPUS_IDS.accountBob },
        { modification: "node.patch" },
      ),
    ).toBe("deny");

    expect(
      await authorizer.authorizeModification(null, { modification: "node.patch" }),
    ).toBe("deny");

    expect(
      await authorizer.authorizeModification(
        { accountNodeId: IDENTITY_CORPUS_IDS.accountAlice },
        { modification: "relationship.delete" },
      ),
    ).toBe("deny");
  });
});
