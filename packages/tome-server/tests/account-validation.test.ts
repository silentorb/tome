import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDataStoreSession } from "tome-db/sync";
import {
  createAccountNodeValidator,
  isAccountNodeInUserCorpus,
} from "../src/identity/account-validation";
import {
  IDENTITY_CORPUS_ID,
  IDENTITY_CORPUS_IDS,
} from "../fixtures/identity-corpus/ids";

const fixtureContent = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/identity-corpus/content",
);

describe("account validation against identity corpus cache", () => {
  let session: Awaited<ReturnType<typeof openDataStoreSession>>;
  let dbPath: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-account-validation-"));
    dbPath = join(dir, "session.sqlite");
    session = await openDataStoreSession({
      dataStores: {
        identity: {
          id: IDENTITY_CORPUS_ID,
          module: "tome-flatfile",
          export: "createFlatfileModule",
          options: { contentPath: fixtureContent },
        },
        sqlite: {
          id: "sqlite",
          module: "tome-sqlite",
          export: "createSqliteModule",
          options: { dbPath },
        },
      },
      queryStoreId: "sqlite",
      defaultContentPath: fixtureContent,
      defaultDbPath: dbPath,
    });
  });

  afterAll(() => {
    session.dispose();
    rmSync(dirname(dbPath), { recursive: true, force: true });
  });

  test("accepts Account members and rejects unknown ids via session cache", async () => {
    const cache = session.writeContext.cache;
    const flatfile = session.writeContext.store;
    const locateSpy = flatfile
      ? (() => {
          let calls = 0;
          const original = flatfile.locateNode.bind(flatfile);
          flatfile.locateNode = (id: string) => {
            calls += 1;
            return original(id);
          };
          return {
            count: () => calls,
            restore: () => {
              flatfile.locateNode = original;
            },
          };
        })()
      : null;
    const findSpy = flatfile && "findContentEntry" in flatfile
      ? (() => {
          let calls = 0;
          const store = flatfile as {
            findContentEntry: (...args: unknown[]) => unknown;
          };
          const original = store.findContentEntry.bind(store);
          store.findContentEntry = (...args: unknown[]) => {
            calls += 1;
            return original(...args);
          };
          return {
            count: () => calls,
            restore: () => {
              store.findContentEntry = original;
            },
          };
        })()
      : null;

    try {
      expect(
        await isAccountNodeInUserCorpus(cache, IDENTITY_CORPUS_IDS.accountAlice),
      ).toBe(true);
      expect(
        await isAccountNodeInUserCorpus(cache, IDENTITY_CORPUS_IDS.accountBob),
      ).toBe(true);
      expect(
        await isAccountNodeInUserCorpus(cache, IDENTITY_CORPUS_IDS.permCanEdit),
      ).toBe(false);
      expect(
        await isAccountNodeInUserCorpus(cache, "01M56A00000000000000999999"),
      ).toBe(false);

      const validate = createAccountNodeValidator(cache);
      expect(await validate(IDENTITY_CORPUS_IDS.accountAlice)).toBe(true);
      expect(await validate("not-an-account")).toBe(false);

      expect(locateSpy?.count() ?? 0).toBe(0);
      expect(findSpy?.count() ?? 0).toBe(0);
    } finally {
      locateSpy?.restore();
      findSpy?.restore();
    }
  });
});
