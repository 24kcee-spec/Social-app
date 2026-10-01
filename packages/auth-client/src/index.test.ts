import { describe, expect, it, vi } from "vitest";
import { AuthClientError, createAuthClient, mapBackendError, type AuthBackend } from "./index";

const ok = { data: {}, error: null };

function fakeBackend(over: Partial<Record<keyof AuthBackend, unknown>> = {}) {
  const b = {
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ok),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ok),
    updateUser: vi.fn(async () => ok),
    getSession: vi.fn(async () => ({ data: { session: { access_token: "tok123" } }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    ...over,
  };
  return b as unknown as AuthBackend & typeof b;
}
const make = (backend: AuthBackend, fetchImpl?: typeof fetch) =>
  createAuthClient({ supabaseUrl: "https://abc.supabase.co", publishableKey: "sb_publishable_x", apiUrl: "http://api.test/", backend, fetchImpl });
const code = (p: Promise<unknown>) => p.then(() => "no-error", (e) => (e instanceof AuthClientError ? e.code : "other"));
const json = (status: number, body?: unknown) => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("validation happens before any network call", () => {
  it("rejects bad sign-up input with field errors and never calls the backend", async () => {
    const b = fakeBackend();
    const err = (await make(b).signUp({ email: "nope", password: "short" }).then(() => null, (e: unknown) => e)) as AuthClientError;
    expect(err).toBeInstanceOf(AuthClientError);
    expect(err.code).toBe("validation");
    expect(Object.keys(err.fieldErrors).sort()).toEqual(["email", "password"]);
    expect(b.signUp).not.toHaveBeenCalled();
  });
  it("rejects an empty sign-in password without calling the backend", async () => {
    const b = fakeBackend();
    expect(await code(make(b).signIn({ email: "a@b.co", password: "" }))).toBe("validation");
    expect(b.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("sign-up", () => {
  it("returns confirm_email when the project requires confirmation, signed_in when it does not", async () => {
    expect(await make(fakeBackend()).signUp({ email: "A@B.co", password: "12345678" })).toBe("confirm_email");
    const b = fakeBackend({ signUp: vi.fn(async () => ({ data: { session: { access_token: "t" } }, error: null })) });
    expect(await make(b).signUp({ email: "a@b.co", password: "12345678", displayName: "Kuda" })).toBe("signed_in");
    expect(b.signUp).toHaveBeenCalledWith({ email: "a@b.co", password: "12345678", options: { data: { display_name: "Kuda" } } });
  });
  it("normalises the email before sending", async () => {
    const b = fakeBackend();
    await make(b).signUp({ email: "  KUDA@Example.COM ", password: "12345678" });
    expect(b.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "kuda@example.com" }));
  });
  it("maps an existing account to already_registered", async () => {
    const b = fakeBackend({ signUp: vi.fn(async () => ({ data: { session: null }, error: { message: "User already registered", status: 422 } })) });
    expect(await code(make(b).signUp({ email: "a@b.co", password: "12345678" }))).toBe("already_registered");
  });
});

describe("sign-in / sign-out", () => {
  it("maps wrong passwords and unconfirmed emails to friendly codes", async () => {
    const bad = fakeBackend({ signInWithPassword: vi.fn(async () => ({ data: {}, error: { message: "Invalid login credentials", status: 400 } })) });
    expect(await code(make(bad).signIn({ email: "a@b.co", password: "x" }))).toBe("invalid_credentials");
    const unconfirmed = fakeBackend({ signInWithPassword: vi.fn(async () => ({ data: {}, error: { message: "Email not confirmed", code: "email_not_confirmed" } })) });
    expect(await code(make(unconfirmed).signIn({ email: "a@b.co", password: "x" }))).toBe("email_not_confirmed");
  });
  it("signs out this device only (local scope)", async () => {
    const b = fakeBackend();
    await make(b).signOut();
    expect(b.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("password reset", () => {
  it("passes the redirect and succeeds", async () => {
    const b = fakeBackend();
    await make(b).requestPasswordReset("A@B.co", "http://localhost:3000/reset");
    expect(b.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: "http://localhost:3000/reset" });
  });
  it("does not reveal whether the email exists, but does surface rate limits", async () => {
    const unknownUser = fakeBackend({ resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: { message: "User not found", status: 400 } })) });
    expect(await code(make(unknownUser).requestPasswordReset("a@b.co", "x"))).toBe("no-error");
    const limited = fakeBackend({ resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: { message: "email rate limit exceeded", status: 429 } })) });
    expect(await code(make(limited).requestPasswordReset("a@b.co", "x"))).toBe("rate_limited");
  });
  it("validates the new password before updating", async () => {
    const b = fakeBackend();
    expect(await code(make(b).setNewPassword("short"))).toBe("validation");
    expect(b.updateUser).not.toHaveBeenCalled();
    await make(b).setNewPassword("long-enough-1");
    expect(b.updateUser).toHaveBeenCalledWith({ password: "long-enough-1" });
  });
});

describe("API calls", () => {
  it("sends the bearer token and returns /me", async () => {
    const f = vi.fn(json(200, { id: "u1", email: "a@b.co", roles: ["user"] }));
    const me = await make(fakeBackend(), f as unknown as typeof fetch).fetchMe();
    expect(me.id).toBe("u1");
    expect(f).toHaveBeenCalledWith("http://api.test/me", { method: "GET", headers: { authorization: "Bearer tok123" } });
  });
  it("fails with not_signed_in without calling the API when there is no session", async () => {
    const f = vi.fn(json(200, {}));
    const b = fakeBackend({ getSession: vi.fn(async () => ({ data: { session: null }, error: null })) });
    expect(await code(make(b, f as unknown as typeof fetch).fetchMe())).toBe("not_signed_in");
    expect(f).not.toHaveBeenCalled();
  });
  it("maps 401 to unauthorized, 5xx and network failures to service_unavailable", async () => {
    expect(await code(make(fakeBackend(), json(401)).fetchMe())).toBe("unauthorized");
    expect(await code(make(fakeBackend(), json(503)).fetchMe())).toBe("service_unavailable");
    const down = (async () => { throw new TypeError("network"); }) as unknown as typeof fetch;
    expect(await code(make(fakeBackend(), down).fetchMe())).toBe("service_unavailable");
  });
  it("lists sessions and revokes one by id", async () => {
    const f = vi.fn(async (url: string, init: { method: string }) =>
      init.method === "DELETE" ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ sessions: [{ id: "s1", current: true }] }), { status: 200 }),
    );
    const c = make(fakeBackend(), f as unknown as typeof fetch);
    expect((await c.listSessions())[0]?.id).toBe("s1");
    await c.revokeSession("s1");
    expect(f).toHaveBeenLastCalledWith("http://api.test/me/sessions/s1", { method: "DELETE", headers: { authorization: "Bearer tok123" } });
  });
});

describe("mapBackendError", () => {
  it("falls back to unknown and treats 5xx as service_unavailable", () => {
    expect(mapBackendError({ message: "weird" }).code).toBe("unknown");
    expect(mapBackendError({ status: 502 }).code).toBe("service_unavailable");
    expect(mapBackendError(null).code).toBe("unknown");
  });
});
