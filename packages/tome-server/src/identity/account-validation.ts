import type { TomeDataStore } from "tome-service-interfaces";
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

/**
 * True when `accountNodeId` is an Account instance in the user corpus
 * (owned by that corpus and linked via set membership to the Account type-table).
 */
export function isAccountNodeInUserCorpus(
  store: TomeDataStore,
  accountNodeId: string,
  options: AccountValidationOptions = {},
): boolean {
  const userCorpusId = options.userCorpusId ?? DEFAULT_USER_CORPUS_ID;
  const accountTypeId = options.accountTypeId ?? IDENTITY_ACCOUNT_TYPE_ID;
  const setType = options.setRelationshipTypeId ?? IDENTITY_SET_RELATIONSHIP_TYPE_ID;
  const id = accountNodeId.trim();
  if (!id) return false;
  if (store.locateNode(id) !== userCorpusId) return false;
  // Set membership tuple: a = type table (set), b = member
  return store.findContentEntry(accountTypeId, id, setType) != null;
}

/** Build a `validateAccountNodeId` callback for HTTP session create. */
export function createAccountNodeValidator(
  store: TomeDataStore,
  options: AccountValidationOptions = {},
): (accountNodeId: string) => boolean {
  return (accountNodeId) => isAccountNodeInUserCorpus(store, accountNodeId, options);
}
