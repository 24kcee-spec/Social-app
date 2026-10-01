import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AuthClaims {
  userId: string;
  email: string | null;
  phone: string | null;
  sessionId: string;
  isAnonymous: boolean;
}

export class AuthError extends Error {
  constructor(public readonly code: "invalid_token" | "auth_unavailable") {
    super(code);
  }
}

export interface VerifierOptions {
  supabaseUrl: string;
  /** Needed only for projects still on legacy HS256 signing (token is then checked by the Auth server). */
  publishableKey?: string;
  jwks?: JWTVerifyGetKey; // injectable for tests
  fetchImpl?: typeof fetch; // injectable for tests
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Supabase stores phones without "+"; normalise to E.164 or null. */
export function normalizePhone(v: unknown): string | null {
  const s = str(v)?.replace(/[\s-]/g, "");
  if (!s) return null;
  const p = s.startsWith("+") ? s : `+${s}`;
  return /^\+[1-9][0-9]{6,14}$/.test(p) ? p : null;
}

function toClaims(c: Record<string, unknown>, sessionId: string | null): AuthClaims {
  const sub = str(c.sub) ?? str(c.id);
  if (!sub || !UUID_RE.test(sub)) throw new AuthError("invalid_token");
  const email = str(c.email)?.toLowerCase() ?? null;
  return {
    userId: sub.toLowerCase(),
    email,
    phone: normalizePhone(c.phone),
    sessionId: sessionId ?? `sub:${sub.toLowerCase()}`,
    isAnonymous: c.is_anonymous === true,
  };
}

export function createTokenVerifier(opts: VerifierOptions): (token: string) => Promise<AuthClaims> {
  const issuer = `${opts.supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
  const jwks = opts.jwks ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const doFetch = opts.fetchImpl ?? fetch;

  async function viaAuthServer(token: string): Promise<AuthClaims> {
    if (!opts.publishableKey) throw new AuthError("auth_unavailable");
    let res: Response;
    try {
      res = await doFetch(`${issuer}/user`, { headers: { apikey: opts.publishableKey, Authorization: `Bearer ${token}` } });
    } catch {
      throw new AuthError("auth_unavailable");
    }
    if (res.status === 401 || res.status === 403) throw new AuthError("invalid_token");
    if (!res.ok) throw new AuthError("auth_unavailable");
    const user = (await res.json()) as Record<string, unknown>;
    const sid = str(decodeJwt(token).session_id); // safe: the Auth server has just validated this token
    return toClaims(user, sid);
  }

  return async (token: string) => {
    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch {
      throw new AuthError("invalid_token");
    }
    if (alg === "HS256") return viaAuthServer(token);
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: "authenticated", algorithms: ["ES256", "RS256"] });
      return toClaims(payload as Record<string, unknown>, str(payload.session_id));
    } catch (err) {
      if (err instanceof AuthError) throw err;
      const code = err instanceof errors.JOSEError ? err.code : undefined;
      if (code === "ERR_JWKS_TIMEOUT" || code === "ERR_JOSE_GENERIC" || !(err instanceof errors.JOSEError)) throw new AuthError("auth_unavailable");
      throw new AuthError("invalid_token");
    }
  };
}
