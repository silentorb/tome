import { relationshipRecordId } from "tome-flatfile";
import type { TomeQueryCache } from "tome-service-interfaces";
import { DEFAULT_USER_CORPUS_ID } from "../load-services";

/** Stable ids from `fixtures/identity-corpus` (Account type + set membership). */
export const IDENTITY_ACCOUNT_TYPE_ID = "01M56A00000000000000000010";
export const IDENTITY_SET_RELATIONSHIP_TYPE_ID = "01M56A00000000000000000020";

export type AccountValidationOptions = {
  /** Corpus id that holds Account nodes (default `identity`). */
  userCorpusId?: string;
  /** Account type-table node id. */
  accountTypeId?: string;
  /** Set-trait relationship type for type-table membership. */
  setRelationshipTypeId?: string;
};

async function hasLiveRelationshipRecord(
  cache: TomeQueryCache,
  a: string,
  b: string,
  type: string,
): Promise<boolean> {
  if (await cache.getRelationshipRecord(relationshipRecordId(a, b, type))) {
    return true;
  }
  if (a !== b && (await cache.getRelationshipRecord(relationshipRecordId(b, a, type)))) {
    return true;
  }
  return false;
}

/**
 * True when `accountNodeId` is an Account instance in the user corpus
 * (owned by that corpus and linked via set membership to the Account type-table).
 * Reads the session SQLite cache (not flatfile).
 */
export async function isAccountNodeInUserCorpus(
  cache: TomeQueryCache,
  accountNodeId: string,
  options: AccountValidationOptions = {},
): Promise<boolean> {
  const userCorpusId = options.userCorpusId ?? DEFAULT_USER_CORPUS_ID;
  const accountTypeId = options.accountTypeId ?? IDENTITY_ACCOUNT_TYPE_ID;
  const setType = options.setRelationshipTypeId ?? IDENTITY_SET_RELATIONSHIP_TYPE_ID;
  const id = accountNodeId.trim();
  if (!id) return false;
  if ((await cache.corpusIdForNode(id)) !== userCorpusId) return false;
  // Set membership tuple: a = type table (set), b = member (either authored order).
  return hasLiveRelationshipRecord(cache, accountTypeId, id, setType);
}

/** Build a `validateAccountNodeId` callback for HTTP session create. */
export function createAccountNodeValidator(
  cache: TomeQueryCache,
  options: AccountValidationOptions = {},
): (accountNodeId: string) => Promise<boolean> {
  return (accountNodeId) => isAccountNodeInUserCorpus(cache, accountNodeId, options);
}
