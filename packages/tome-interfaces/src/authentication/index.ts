/** LCD session shape for authentication providers (mirrors web API Session). */
export type AuthenticationSession = {
  id: string;
  /** Account node id in a user corpus (provisional IdP claim until bindings exist). */
  accountNodeId: string;
};

export type AuthenticationSessionCreateInput = {
  accountNodeId: string;
};

/**
 * Opened authentication strategy (OIDC, etc.).
 * Host mounts thin `/api/auth/*` routes that delegate here.
 */
export interface AuthenticationProvider {
  beginLogin(req: Request): Response | Promise<Response>;
  handleCallback(req: Request): Response | Promise<Response>;
}

export type AuthenticationOpenContext = {
  /** Merged extension + component params. */
  params: Record<string, unknown>;
  createSession(
    input: AuthenticationSessionCreateInput,
  ): AuthenticationSession | Promise<AuthenticationSession>;
  /**
   * Host-provided `Set-Cookie` header value for the session id (same-site cookie).
   * Secure flag may depend on the request URL.
   */
  sessionCookieHeader(sessionId: string, req: Request): string;
};

export type AuthenticationRegistration = {
  implementationId: string;
  open(ctx: AuthenticationOpenContext): AuthenticationProvider | Promise<AuthenticationProvider>;
};

export interface AuthenticationHost {
  registerAuthenticationProvider(registration: AuthenticationRegistration): void;
}

export type AuthenticationModule = {
  register(host: AuthenticationHost): void;
};
