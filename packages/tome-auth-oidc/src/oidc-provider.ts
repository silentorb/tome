import type {
  AuthenticationOpenContext,
  AuthenticationProvider,
} from "tome-interfaces/authentication";

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
};

type PendingAuth = {
  codeVerifier: string;
  redirectUri: string;
  postLoginRedirect: string;
};

export type OidcProviderParams = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  subjectClaim: string;
  postLoginRedirect: string;
};

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`tome-auth-oidc: params.${key} must be a non-empty string`);
  }
  return value.trim();
}

function resolveClientSecret(params: Record<string, unknown>): string {
  if (typeof params.clientSecret === "string" && params.clientSecret.trim()) {
    return params.clientSecret.trim();
  }
  if (typeof params.clientSecretEnv === "string" && params.clientSecretEnv.trim()) {
    const fromEnv = process.env[params.clientSecretEnv.trim()]?.trim();
    if (fromEnv) return fromEnv;
    throw new Error(
      `tome-auth-oidc: env ${params.clientSecretEnv.trim()} is empty or unset`,
    );
  }
  throw new Error(
    "tome-auth-oidc: params.clientSecret or params.clientSecretEnv is required",
  );
}

export function parseOidcParams(params: Record<string, unknown>): OidcProviderParams {
  const scopesRaw = params.scopes;
  const scopes =
    typeof scopesRaw === "string" && scopesRaw.trim() ? scopesRaw.trim() : "openid";
  const subjectClaim =
    typeof params.subjectClaim === "string" && params.subjectClaim.trim()
      ? params.subjectClaim.trim()
      : "sub";
  const postLoginRedirect =
    typeof params.postLoginRedirect === "string" && params.postLoginRedirect.trim()
      ? params.postLoginRedirect.trim()
      : "/";
  return {
    issuer: requireString(params, "issuer").replace(/\/$/, ""),
    clientId: requireString(params, "clientId"),
    clientSecret: resolveClientSecret(params),
    redirectUri: requireString(params, "redirectUri"),
    scopes,
    subjectClaim,
    postLoginRedirect,
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64Url(new Uint8Array(digest));
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("invalid id_token");
  const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  const json = atob(padded);
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid id_token payload");
  }
  return parsed as Record<string, unknown>;
}

async function fetchDiscovery(issuer: string): Promise<OidcDiscovery> {
  const url = `${issuer}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) at ${url}`);
  }
  const body = (await res.json()) as Partial<OidcDiscovery>;
  if (
    typeof body.authorization_endpoint !== "string" ||
    typeof body.token_endpoint !== "string"
  ) {
    throw new Error("OIDC discovery missing authorization_endpoint or token_endpoint");
  }
  return {
    authorization_endpoint: body.authorization_endpoint,
    token_endpoint: body.token_endpoint,
  };
}

function redirectResponse(location: string, setCookie?: string): Response {
  const headers = new Headers({ Location: location });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return new Response(null, { status: 302, headers });
}

function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createOidcAuthenticationProvider(
  ctx: AuthenticationOpenContext,
): AuthenticationProvider {
  const config = parseOidcParams(ctx.params);
  const pending = new Map<string, PendingAuth>();
  let discoveryPromise: Promise<OidcDiscovery> | null = null;

  const discovery = () => {
    discoveryPromise ??= fetchDiscovery(config.issuer);
    return discoveryPromise;
  };

  return {
    async beginLogin(_req: Request): Promise<Response> {
      try {
        const meta = await discovery();
        const state = crypto.randomUUID();
        const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
        const codeChallenge = await sha256Base64Url(codeVerifier);
        pending.set(state, {
          codeVerifier,
          redirectUri: config.redirectUri,
          postLoginRedirect: config.postLoginRedirect,
        });

        const authorize = new URL(meta.authorization_endpoint);
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("client_id", config.clientId);
        authorize.searchParams.set("redirect_uri", config.redirectUri);
        authorize.searchParams.set("scope", config.scopes);
        authorize.searchParams.set("state", state);
        authorize.searchParams.set("code_challenge", codeChallenge);
        authorize.searchParams.set("code_challenge_method", "S256");
        return redirectResponse(authorize.toString());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResponse(message, 500);
      }
    },

    async handleCallback(req: Request): Promise<Response> {
      try {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        if (oauthError) {
          return errorResponse(
            url.searchParams.get("error_description") ?? oauthError,
            400,
          );
        }
        if (!code || !state) {
          return errorResponse("missing code or state");
        }
        const pendingAuth = pending.get(state);
        pending.delete(state);
        if (!pendingAuth) {
          return errorResponse("invalid or expired state");
        }

        const meta = await discovery();
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: pendingAuth.redirectUri,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code_verifier: pendingAuth.codeVerifier,
        });
        const tokenRes = await fetch(meta.token_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          return errorResponse(`token exchange failed (${tokenRes.status}): ${text}`, 502);
        }
        const tokenJson = (await tokenRes.json()) as { id_token?: unknown };
        if (typeof tokenJson.id_token !== "string" || !tokenJson.id_token) {
          return errorResponse("token response missing id_token", 502);
        }
        const claims = decodeJwtPayload(tokenJson.id_token);
        const subjectRaw = claims[config.subjectClaim];
        if (typeof subjectRaw !== "string" || !subjectRaw.trim()) {
          return errorResponse(
            `id_token missing string claim "${config.subjectClaim}"`,
            502,
          );
        }
        const session = await ctx.createSession({ subjectId: subjectRaw.trim() });
        return redirectResponse(
          pendingAuth.postLoginRedirect,
          ctx.sessionCookieHeader(session.id, req),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResponse(message, 500);
      }
    },
  };
}
