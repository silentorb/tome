/**
 * Minimal in-process OIDC IdP for authorization-code + PKCE tests.
 */
export function startMockOidcIdp(options?: {
  subjectId?: string;
  clientId?: string;
  clientSecret?: string;
}): {
  issuer: string;
  clientId: string;
  clientSecret: string;
  stop(): void;
} {
  const subjectId = options?.subjectId ?? "oidc-user-1";
  const clientId = options?.clientId ?? "tome-test-client";
  const clientSecret = options?.clientSecret ?? "tome-test-secret";
  const codes = new Map<
    string,
    { redirectUri: string; codeChallenge: string; codeChallengeMethod: string }
  >();

  let port = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const issuer = `http://127.0.0.1:${port}`;

      if (url.pathname === "/.well-known/openid-configuration") {
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["none"],
        });
      }

      if (url.pathname === "/authorize" && req.method === "GET") {
        const redirectUri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        const codeChallenge = url.searchParams.get("code_challenge");
        const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "S256";
        const reqClientId = url.searchParams.get("client_id");
        if (!redirectUri || !state || !codeChallenge || reqClientId !== clientId) {
          return new Response("bad authorize request", { status: 400 });
        }
        const code = crypto.randomUUID();
        codes.set(code, { redirectUri, codeChallenge, codeChallengeMethod });
        const target = new URL(redirectUri);
        target.searchParams.set("code", code);
        target.searchParams.set("state", state);
        return Response.redirect(target.toString(), 302);
      }

      if (url.pathname === "/token" && req.method === "POST") {
        const body = await req.text();
        const params = new URLSearchParams(body);
        const code = params.get("code");
        const redirectUri = params.get("redirect_uri");
        const reqClientId = params.get("client_id");
        const reqSecret = params.get("client_secret");
        const codeVerifier = params.get("code_verifier");
        if (
          !code ||
          !redirectUri ||
          !codeVerifier ||
          reqClientId !== clientId ||
          reqSecret !== clientSecret
        ) {
          return Response.json({ error: "invalid_client" }, { status: 400 });
        }
        const pending = codes.get(code);
        codes.delete(code);
        if (!pending || pending.redirectUri !== redirectUri) {
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        }
        const challenge = await pkceChallengeS256(codeVerifier);
        if (challenge !== pending.codeChallenge) {
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        }
        const now = Math.floor(Date.now() / 1000);
        const idToken = unsignedJwt({
          sub: subjectId,
          iss: issuer,
          aud: clientId,
          iat: now,
          exp: now + 3600,
        });
        return Response.json({
          access_token: "mock-access",
          token_type: "Bearer",
          id_token: idToken,
          expires_in: 3600,
        });
      }

      return new Response("not found", { status: 404 });
    },
  });
  if (typeof server.port !== "number") {
    server.stop(true);
    throw new Error("mock IdP failed to bind a port");
  }
  port = server.port;

  return {
    issuer: `http://127.0.0.1:${port}`,
    clientId,
    clientSecret,
    stop() {
      server.stop(true);
    },
  };
}

function unsignedJwt(payload: Record<string, unknown>): string {
  const header = { alg: "none", typ: "JWT" };
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.`;
}

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
