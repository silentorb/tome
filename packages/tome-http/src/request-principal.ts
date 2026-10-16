import { AsyncLocalStorage } from "node:async_hooks";
import type { Principal } from "./identity";

const principalStorage = new AsyncLocalStorage<Principal | null>();

/** Principal for the current API request, or null when anonymous / unset. */
export function getRequestPrincipal(): Principal | null {
  const value = principalStorage.getStore();
  return value === undefined ? null : value;
}

export function runWithRequestPrincipal<T>(
  principal: Principal | null,
  fn: () => T,
): T {
  return principalStorage.run(principal, fn);
}

export async function runWithRequestPrincipalAsync<T>(
  principal: Principal | null,
  fn: () => Promise<T>,
): Promise<T> {
  return principalStorage.run(principal, fn);
}

/** Primary credential: `Authorization: Session <sessionId>`. */
export function extractSessionIdFromRequest(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^\s*Session\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}
