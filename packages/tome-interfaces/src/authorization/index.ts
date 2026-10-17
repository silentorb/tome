/**
 * Denial authorizers (multi-user phase 3a).
 *
 * Separate interfaces per payload family so Imp-query and modification policies
 * can be mixed independently. Additive / fail-closed: server defaults to deny;
 * grants are explicit (allow-everything or custom authorizers).
 */

/** Subject for authorization decisions (aligns with web API Principal). */
export type AuthorizationPrincipal = {
  /** Account node id in a user corpus. */
  accountNodeId: string;
};

export type AuthorizationDecision = "allow" | "deny";

/** Built-in authorizer implementation ids selectable from server config. */
export type BuiltInAuthorizerId = "deny-everything" | "allow-everything";

/** Context for Imp / open-ended query denial. */
export type ImpQueryAuthorizationContext = {
  /** Imp graph body from the request (opaque to the LCD). */
  graph: unknown;
  context?: unknown;
};

/**
 * Authorizer for Imp query payloads (e.g. POST /api/nodes/query).
 * Not bundled with modification — register independently.
 */
export interface ImpQueryAuthorizer {
  authorize(
    principal: AuthorizationPrincipal | null,
    context: ImpQueryAuthorizationContext,
  ): AuthorizationDecision | Promise<AuthorizationDecision>;
}

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
 * Authorizer for graph/content modification payloads.
 * Not bundled with Imp query — register independently.
 */
export interface ModificationAuthorizer {
  authorize(
    principal: AuthorizationPrincipal | null,
    context: ModificationAuthorizationContext,
  ): AuthorizationDecision | Promise<AuthorizationDecision>;
}

/** Host seam: extensions (or tests) replace slots independently. */
export interface AuthorizationHost {
  registerImpQueryAuthorizer(authorizer: ImpQueryAuthorizer): void;
  registerModificationAuthorizer(authorizer: ModificationAuthorizer): void;
}

export type AuthorizationModule = {
  register(host: AuthorizationHost): void;
};

/** Always deny — additive baseline / server default. */
export function createDenyEverythingImpQueryAuthorizer(): ImpQueryAuthorizer {
  return {
    authorize() {
      return "deny";
    },
  };
}

export function createDenyEverythingModificationAuthorizer(): ModificationAuthorizer {
  return {
    authorize() {
      return "deny";
    },
  };
}

/** Always allow — explicit light solo / trusted-host grant only. */
export function createAllowEverythingImpQueryAuthorizer(): ImpQueryAuthorizer {
  return {
    authorize() {
      return "allow";
    },
  };
}

export function createAllowEverythingModificationAuthorizer(): ModificationAuthorizer {
  return {
    authorize() {
      return "allow";
    },
  };
}

export function resolveBuiltInImpQueryAuthorizer(
  id: BuiltInAuthorizerId,
): ImpQueryAuthorizer {
  return id === "allow-everything"
    ? createAllowEverythingImpQueryAuthorizer()
    : createDenyEverythingImpQueryAuthorizer();
}

export function resolveBuiltInModificationAuthorizer(
  id: BuiltInAuthorizerId,
): ModificationAuthorizer {
  return id === "allow-everything"
    ? createAllowEverythingModificationAuthorizer()
    : createDenyEverythingModificationAuthorizer();
}
