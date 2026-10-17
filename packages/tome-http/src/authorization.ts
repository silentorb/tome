import {
  createAllowEverythingImpQueryAuthorizer,
  createAllowEverythingModificationAuthorizer,
  createDenyEverythingImpQueryAuthorizer,
  createDenyEverythingModificationAuthorizer,
  type ImpQueryAuthorizer,
  type ImpQueryAuthorizationContext,
  type ModificationAuthorizer,
  type ModificationAuthorizationContext,
} from "tome-interfaces/authorization";
import type { Principal } from "./identity";

export type {
  ImpQueryAuthorizer,
  ModificationAuthorizer,
  ImpQueryAuthorizationContext,
  ModificationAuthorizationContext,
} from "tome-interfaces/authorization";

const defaultImpQueryAuthorizer = createDenyEverythingImpQueryAuthorizer();
const defaultModificationAuthorizer = createDenyEverythingModificationAuthorizer();

/** Fail-closed defaults when handler options omit authorizer getters. */
export function defaultImpQueryAuthorizerGetter(): ImpQueryAuthorizer {
  return defaultImpQueryAuthorizer;
}

export function defaultModificationAuthorizerGetter(): ModificationAuthorizer {
  return defaultModificationAuthorizer;
}

/** Explicit light solo / test grant — never used as an implicit default. */
export function allowEverythingAuthorizerOptions(): {
  getImpQueryAuthorizer: () => ImpQueryAuthorizer;
  getModificationAuthorizer: () => ModificationAuthorizer;
} {
  const imp = createAllowEverythingImpQueryAuthorizer();
  const mod = createAllowEverythingModificationAuthorizer();
  return {
    getImpQueryAuthorizer: () => imp,
    getModificationAuthorizer: () => mod,
  };
}

export async function decideImpQuery(
  authorizer: ImpQueryAuthorizer,
  principal: Principal | null,
  context: ImpQueryAuthorizationContext,
): Promise<"allow" | "deny"> {
  return authorizer.authorize(principal, context);
}

export async function decideModification(
  authorizer: ModificationAuthorizer,
  principal: Principal | null,
  context: ModificationAuthorizationContext,
): Promise<"allow" | "deny"> {
  return authorizer.authorize(principal, context);
}
