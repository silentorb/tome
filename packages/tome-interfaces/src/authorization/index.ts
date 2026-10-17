/**
 * Denial authorizer (multi-user phase 3a).
 *
 * One Authorizer handles Imp-query and modification denial. Additive / fail-closed:
 * server defaults to deny-everything; grants are explicit (allow-everything,
 * authorization-model, or a custom registered authorizer).
 */

/** Subject for authorization decisions (aligns with web API Principal). */
export type AuthorizationPrincipal = {
  /** Account node id in a user corpus. */
  accountNodeId: string;
};

export type AuthorizationDecision = "allow" | "deny";

/** Built-in authorizer implementation ids selectable from server config. */
export type BuiltInAuthorizerId =
  | "deny-everything"
  | "allow-everything"
  | "authorization-model";

/** Context for Imp / open-ended query denial. */
export type ImpQueryAuthorizationContext = {
  /** Imp graph body from the request (opaque to the LCD). */
  graph: unknown;
  context?: unknown;
};

/** Context for graph/content modification denial. */
export type ModificationAuthorizationContext = {
  /**
   * Stable modification family id (e.g. "node.create", "node.patch",
   * "relationship.delete") — not an HTTP verb.
   */
  modification: string;
  /** Optional payload fragment for richer policies later. */
  payload?: unknown;
};

/**
 * Denial authorizer for Imp queries and graph/content modifications.
 */
export interface Authorizer {
  authorizeImpQuery(
    principal: AuthorizationPrincipal | null,
    context: ImpQueryAuthorizationContext,
  ): AuthorizationDecision | Promise<AuthorizationDecision>;

  authorizeModification(
    principal: AuthorizationPrincipal | null,
    context: ModificationAuthorizationContext,
  ): AuthorizationDecision | Promise<AuthorizationDecision>;
}

/** Host seam: extensions (or tests) replace the active authorizer. */
export interface AuthorizationHost {
  registerAuthorizer(authorizer: Authorizer): void;
}

export type AuthorizationModule = {
  register(host: AuthorizationHost): void;
};

/** Always deny — additive baseline / server default. */
export function createDenyEverythingAuthorizer(): Authorizer {
  return {
    authorizeImpQuery() {
      return "deny";
    },
    authorizeModification() {
      return "deny";
    },
  };
}

/** Always allow — explicit light solo / trusted-host grant only. */
export function createAllowEverythingAuthorizer(): Authorizer {
  return {
    authorizeImpQuery() {
      return "allow";
    },
    authorizeModification() {
      return "allow";
    },
  };
}

/**
 * Authorization-model authorizer (first pass): discovers model instance ids via
 * the provided callback but always denies until policy child nodes exist.
 */
export type AuthorizationModelAuthorizerOptions = {
  /**
   * Returns Authorization Model instance node ids (set members of the
   * ontology.json types.authorizationModel type-table), across configured corpora.
   */
  listInstanceIds: () => readonly string[] | Promise<readonly string[]>;
};

export function createAuthorizationModelAuthorizer(
  options: AuthorizationModelAuthorizerOptions,
): Authorizer & { listInstanceIds: () => readonly string[] | Promise<readonly string[]> } {
  return {
    listInstanceIds: options.listInstanceIds,
    authorizeImpQuery() {
      return "deny";
    },
    authorizeModification() {
      return "deny";
    },
  };
}

/** Resolve allow/deny built-ins only (authorization-model needs discovery deps). */
export function resolveConstantBuiltInAuthorizer(
  id: "deny-everything" | "allow-everything",
): Authorizer {
  return id === "allow-everything"
    ? createAllowEverythingAuthorizer()
    : createDenyEverythingAuthorizer();
}
