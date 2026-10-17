/**
 * Denial authorizer (multi-user phase 3a/3b).
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

/** Modification families gated by the can-edit-nodes policy (phase 3b). */
export const NODE_EDIT_MODIFICATION_FAMILIES: readonly string[] = [
  "node.create",
  "node.patch",
  "node.delete",
  "node.archive",
  "node.unarchive",
];

/**
 * Authorization-model authorizer.
 *
 * Without `evaluateModification`, remains fail-closed (always deny) after discovery.
 * With `evaluateModification` (phase 3b): Imp queries are allowed; listed node-edit
 * families call the evaluator; other modifications deny.
 */
export type AuthorizationModelAuthorizerOptions = {
  /**
   * Returns Authorization Model instance node ids (set members of the
   * ontology.json types.authorizationModel type-table), across configured corpora.
   */
  listInstanceIds: () => readonly string[] | Promise<readonly string[]>;
  /**
   * When set, Imp queries allow and node-edit modifications consult this callback.
   * Fail closed on errors (caller should return "deny").
   */
  evaluateModification?: (
    principal: AuthorizationPrincipal | null,
    context: ModificationAuthorizationContext,
  ) => AuthorizationDecision | Promise<AuthorizationDecision>;
  /**
   * Modification families that use `evaluateModification`.
   * Defaults to {@link NODE_EDIT_MODIFICATION_FAMILIES}.
   */
  nodeEditModifications?: readonly string[];
};

export function createAuthorizationModelAuthorizer(
  options: AuthorizationModelAuthorizerOptions,
): Authorizer & { listInstanceIds: () => readonly string[] | Promise<readonly string[]> } {
  const nodeEdit = new Set(
    options.nodeEditModifications ?? NODE_EDIT_MODIFICATION_FAMILIES,
  );
  const evaluate = options.evaluateModification;

  return {
    listInstanceIds: options.listInstanceIds,
    authorizeImpQuery() {
      // View path: allow Imp when policy evaluation is wired (phase 3b).
      // Stub without evaluator stays fail-closed.
      return evaluate ? "allow" : "deny";
    },
    async authorizeModification(principal, context) {
      if (!evaluate) return "deny";
      if (!nodeEdit.has(context.modification)) return "deny";
      return evaluate(principal, context);
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
