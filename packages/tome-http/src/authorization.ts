import {
  createAllowEverythingAuthorizer,
  createDenyEverythingAuthorizer,
  type Authorizer,
  type ImpQueryAuthorizationContext,
  type ModificationAuthorizationContext,
} from "tome-interfaces/authorization";
import type { Principal } from "./identity";

export type {
  Authorizer,
  ImpQueryAuthorizationContext,
  ModificationAuthorizationContext,
} from "tome-interfaces/authorization";

const defaultAuthorizer = createDenyEverythingAuthorizer();

/** Fail-closed default when handler options omit the authorizer getter. */
export function defaultAuthorizerGetter(): Authorizer {
  return defaultAuthorizer;
}

/** Explicit light solo / test grant — never used as an implicit default. */
export function allowEverythingAuthorizerOptions(): {
  getAuthorizer: () => Authorizer;
} {
  const authorizer = createAllowEverythingAuthorizer();
  return {
    getAuthorizer: () => authorizer,
  };
}

export async function decideImpQuery(
  authorizer: Authorizer,
  principal: Principal | null,
  context: ImpQueryAuthorizationContext,
): Promise<"allow" | "deny"> {
  return authorizer.authorizeImpQuery(principal, context);
}

export async function decideModification(
  authorizer: Authorizer,
  principal: Principal | null,
  context: ModificationAuthorizationContext,
): Promise<"allow" | "deny"> {
  return authorizer.authorizeModification(principal, context);
}
