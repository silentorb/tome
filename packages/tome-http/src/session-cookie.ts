/** Same-site session cookie name (browser clients via UI-origin `/api` proxy). */
export const SESSION_COOKIE_NAME = "tome_session";

/** Build `Set-Cookie` for a new session. `Secure` when the request URL is HTTPS. */
export function sessionCookieHeader(sessionId: string, req?: Request): string {
  const secure = req ? new URL(req.url).protocol === "https:" : false;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Build `Set-Cookie` that clears the session cookie. */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Parse `tome_session` from a Cookie header value. */
export function extractSessionIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const raw = trimmed.slice(eq + 1).trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
