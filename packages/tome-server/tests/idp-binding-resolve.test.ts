import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDataStoreSession } from "tome-db/sync";
import {
  IDENTITY_ALICE_OIDC_ISSUER,
  IDENTITY_ALICE_OIDC_SUBJECT,
  IDENTITY_CORPUS_ID,
  IDENTITY_CORPUS_IDS,
} from "../fixtures/identity-corpus/ids";
import {
  contentHasIdpBindingType,
  createResolveAccountFromIdpClaim,
  loadIdpBindingTypeId,
} from "../src/identity/idp-binding-resolve";

const identityContent = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/identity-corpus/content",
);

describe("IdP binding resolve via shared SQLite", () => {
  let session: Awaited<ReturnType<typeof openDataStoreSession>>;
  let dbPath: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-idp-binding-"));
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

  test("ontology declares types.idpBinding", () => {
    expect(contentHasIdpBindingType(identityContent)).toBe(true);
    expect(loadIdpBindingTypeId(identityContent)).toBe(IDENTITY_CORPUS_IDS.idpBindingType);
  });

  test("resolves Alice binding; unknown claim returns null", async () => {
    const resolve = createResolveAccountFromIdpClaim({
      queryAll: (sql, ...params) => session.writeContext.cache.queryAll(sql, ...params),
    });

    expect(
      await resolve({
        issuer: IDENTITY_ALICE_OIDC_ISSUER,
        subject: IDENTITY_ALICE_OIDC_SUBJECT,
      }),
    ).toBe(IDENTITY_CORPUS_IDS.accountAlice);

    expect(
      await resolve({
        issuer: IDENTITY_ALICE_OIDC_ISSUER,
        subject: "nobody@example.com",
      }),
    ).toBeNull();

    expect(
      await resolve({
        issuer: "https://other.idp.test",
        subject: IDENTITY_ALICE_OIDC_SUBJECT,
      }),
    ).toBeNull();

    expect(await resolve({ issuer: "  ", subject: IDENTITY_ALICE_OIDC_SUBJECT })).toBeNull();
  });
});
