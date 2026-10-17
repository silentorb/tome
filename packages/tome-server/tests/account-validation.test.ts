import { describe, expect, test } from "bun:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "tome-flatfile";
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

describe("account validation against identity corpus", () => {
  test("accepts Account members and rejects unknown ids", () => {
    const store = new ContentStore(fixtureContent, { corpusId: IDENTITY_CORPUS_ID });
    try {
      expect(
        isAccountNodeInUserCorpus(store, IDENTITY_CORPUS_IDS.accountAlice),
      ).toBe(true);
      expect(
        isAccountNodeInUserCorpus(store, IDENTITY_CORPUS_IDS.accountBob),
      ).toBe(true);
      expect(isAccountNodeInUserCorpus(store, IDENTITY_CORPUS_IDS.permCanEdit)).toBe(
        false,
      );
      expect(isAccountNodeInUserCorpus(store, "01M56A00000000000000999999")).toBe(
        false,
      );

      const validate = createAccountNodeValidator(store);
      expect(validate(IDENTITY_CORPUS_IDS.accountAlice)).toBe(true);
      expect(validate("not-an-account")).toBe(false);
    } finally {
      store.close();
    }
  });
});
