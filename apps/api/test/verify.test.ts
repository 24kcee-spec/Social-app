import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type KeyLike } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { AuthError, createTokenVerifier, normalizePhone } from "../src/auth/verify";

const URL_ = "https://abc.supabase.co";
const ISS = `${URL_}/auth/v1`;
const SUB = "11111111-1111-4111-8111-111111111111";
let signKey: KeyLike;
let otherKey: KeyLike;
let verify: ReturnType<typeof createTokenVerifier>;

async function token(over: { key?: KeyLike; iss?: string; aud?: string; exp?: string; claims?: Record<string, unknown> } = {}) {
  return new SignJWT({ email: "Kuda@Example.com", session_id: "sess-1", ...over.claims })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setSubject(SUB).setIssuer(over.iss ?? ISS).setAudience(over.aud ?? "authenticated")
    .setIssuedAt().setExpirationTime(over.exp ?? "1h")
    .sign(over.key ?? signKey);
}
const code = async (p: Promise<unknown>) => p.then(() => "no-error", (e) => (e instanceof AuthError ? e.code : "other"));

beforeAll(async () => {
  const kp = await generateKeyPair("ES256");
  signKey = kp.privateKey;
  otherKey = (await generateKeyPair("ES256")).privateKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  verify = createTokenVerifier({ supabaseUrl: URL_, jwks: createLocalJWKSet({ keys: [jwk] }) });
});

describe("asymmetric (JWKS) verification", () => {
  it("accepts a valid token and normalises claims", async () => {
    expect(await verify(await token())).toEqual({ userId: SUB, email: "kuda@example.com", phone: null, sessionId: "sess-1", isAnonymous: false });
  });
  it("rejects expired tokens", async () => expect(await code(verify(await token({ exp: "-1m" })))).toBe("invalid_token"));
  it("rejects wrong issuer", async () => expect(await code(verify(await token({ iss: "https://evil.example/auth/v1" })))).toBe("invalid_token"));
  it("rejects wrong audience", async () => expect(await code(verify(await token({ aud: "anon" })))).toBe("invalid_token"));
  it("rejects tokens signed by another key", async () => expect(await code(verify(await token({ key: otherKey })))).toBe("invalid_token"));
  it("rejects garbage and unsigned (alg none) tokens", async () => {
    expect(await code(verify("not-a-jwt"))).toBe("invalid_token");
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    expect(await code(verify(`${b({ alg: "none" })}.${b({ sub: SUB, iss: ISS, aud: "authenticated" })}.`))).toBe("invalid_token");
  });
  it("rejects a non-UUID subject", async () => {
    const t = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: "k1" }).setSubject("admin").setIssuer(ISS).setAudience("authenticated").setExpirationTime("1h").sign(signKey);
    expect(await code(verify(t))).toBe("invalid_token");
  });
  it("flags anonymous users", async () => expect((await verify(await token({ claims: { is_anonymous: true } }))).isAnonymous).toBe(true));
});

describe("legacy HS256 verification via the Auth server", () => {
  const hs = () => new SignJWT({ session_id: "legacy-sess" }).setProtectedHeader({ alg: "HS256" }).setSubject(SUB).setExpirationTime("1h").sign(new TextEncoder().encode("secret"));
  const mk = (fetchImpl: typeof fetch, publishableKey: string | undefined = "sb_publishable_x") =>
    createTokenVerifier({ supabaseUrl: URL_, publishableKey, fetchImpl, jwks: createLocalJWKSet({ keys: [] }) });
  const res = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("accepts when the Auth server confirms the token", async () => {
    const c = await mk(res(200, { id: SUB, email: "A@B.co", phone: "263771234567" }))(await hs());
    expect(c).toMatchObject({ userId: SUB, email: "a@b.co", phone: "+263771234567", sessionId: "legacy-sess" });
  });
  it("rejects when the Auth server says 401", async () => expect(await code(mk(res(401))(await hs()))).toBe("invalid_token"));
  it("reports unavailable on network failure or 5xx", async () => {
    expect(await code(mk((async () => { throw new Error("down"); }) as unknown as typeof fetch)(await hs()))).toBe("auth_unavailable");
    expect(await code(mk(res(500))(await hs()))).toBe("auth_unavailable");
  });
  it("reports unavailable when no publishable key is configured", async () => expect(await code(mk(res(200), "")(await hs()))).toBe("auth_unavailable"));
});

describe("normalizePhone", () => {
  it("adds + and rejects junk", () => {
    expect(normalizePhone("263771234567")).toBe("+263771234567");
    expect(normalizePhone("+263 77 123 4567")).toBe("+263771234567");
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});
