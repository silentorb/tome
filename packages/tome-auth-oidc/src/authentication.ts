import type { AuthenticationHost } from "tome-interfaces/authentication";
import { createOidcAuthenticationProvider } from "./oidc-provider";

/**
 * Registers the generic OIDC auth-code provider (`implementationId: "tome-auth-oidc"`).
 */
export function register(host: AuthenticationHost): void {
  host.registerAuthenticationProvider({
    implementationId: "tome-auth-oidc",
    open(ctx) {
      return createOidcAuthenticationProvider(ctx);
    },
  });
}
