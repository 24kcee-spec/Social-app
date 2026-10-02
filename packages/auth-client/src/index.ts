import { createClient } from "@supabase/supabase-js";
import { newPasswordSchema, passwordResetRequestSchema, signInSchema, signUpFormSchema } from "@sp/validation";

/** One client for web AND mobile: same rules, same error messages, same API calls (blueprint: one identity everywhere). */

export type AuthErrorCode =
  | "validation"
  | "invalid_credentials"
  | "already_registered"
  | "email_not_confirmed"
  | "rate_limited"
  | "weak_password"
  | "not_signed_in"
  | "unauthorized"
  | "service_unavailable"
  | "unknown";

const MESSAGES: Record<AuthErrorCode, string> = {
  validation: "Please check the highlighted details and try again.",
  invalid_credentials: "That email and password do not match.",
  already_registered: "An account with this email already exists. Try signing in.",
  email_not_confirmed: "Please confirm your email first - check your inbox for the link.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  weak_password: "That password is too weak. Use at least 8 characters.",
  not_signed_in: "You are signed out. Please sign in again.",
  unauthorized: "Your session has ended. Please sign in again.",
  service_unavailable: "The service is not reachable right now. Please try again shortly.",
  unknown: "Something went wrong. Please try again.",
};

export class AuthClientError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(MESSAGES[code]);
    this.name = "AuthClientError";
  }
}

interface BackendError { message?: string; status?: number; code?: string; }
interface BackendSession { access_token: string; }
type BackendResult<T> = Promise<{ data: T; error: BackendError | null }>;

export interface AuthBackend {
  signUp(args: { email: string; password: string; options?: { data?: Record<string, unknown> } }): BackendResult<{ session: BackendSession | null }>;
  signInWithPassword(args: { email: string; password: string }): BackendResult<unknown>;
  signOut(args?: { scope?: "global" | "local" | "others" }): Promise<{ error: BackendError | null }>;
  resetPasswordForEmail(email: string, options?: { redirectTo?: string }): BackendResult<unknown>;
  updateUser(args: { password: string }): BackendResult<unknown>;
  getSession(): BackendResult<{ session: BackendSession | null }>;
  onAuthStateChange(cb: (event: string, session: BackendSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
}

export interface Me {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: string[];
  createdAt: string;
  lastActiveAt: string | null;
}
export interface DeviceSession { id: string; userAgent: string | null; firstSeenAt: string; lastSeenAt: string; current: boolean; }

export interface AuthClientConfig {
  /** Supabase project URL + PUBLISHABLE key only. The secret key must never be passed to a client. */
  supabaseUrl: string;
  publishableKey: string;
  apiUrl: string;
  storage?: unknown;
  detectSessionInUrl?: boolean;
  backend?: AuthBackend;
  fetchImpl?: typeof fetch;
}

export interface SupabaseClientConfig {
  supabaseUrl: string;
  publishableKey: string;
  storage?: unknown;
  detectSessionInUrl?: boolean;
}

/** Shared Supabase client factory for Storage and other non-auth features. Publishable key only. */
export function createSupabaseClient(config: SupabaseClientConfig) {
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      storage: config.storage as never,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
    },
  });
}

export function mapBackendError(err: BackendError | null | undefined): AuthClientError {
  const msg = (err?.message ?? "").toLowerCase();
  const code = (err?.code ?? "").toLowerCase();
  if (err?.status === 429 || code.includes("rate_limit") || msg.includes("rate limit")) return new AuthClientError("rate_limited");
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return new AuthClientError("invalid_credentials");
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return new AuthClientError("email_not_confirmed");
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) return new AuthClientError("already_registered");
  if (code === "weak_password" || msg.includes("password should be")) return new AuthClientError("weak_password");
  if (err?.status !== undefined && err.status >= 500) return new AuthClientError("service_unavailable");
  return new AuthClientError("unknown");
}

function fieldErrorsOf(issues: { path: (string | number)[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

export function createAuthClient(config: AuthClientConfig) {
  const supabase = createSupabaseClient(config);
  const backend: AuthBackend = config.backend ?? (supabase.auth as unknown as AuthBackend);
  const doFetch = config.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const api = config.apiUrl.replace(/\/+$/, "");

  async function accessToken(): Promise<string> {
    const { data } = await backend.getSession();
    if (!data.session) throw new AuthClientError("not_signed_in");
    return data.session.access_token;
  }

  async function apiCall<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T | undefined> {
    const token = await accessToken();
    let res: Response;
    try {
      res = await doFetch(`${api}${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      throw new AuthClientError("service_unavailable");
    }
    if (res.status === 401) throw new AuthClientError("unauthorized");
    if (!res.ok) throw new AuthClientError(res.status >= 500 ? "service_unavailable" : "unknown");
    return res.status === 204 ? undefined : ((await res.json()) as T);
  }

  return {
    async signUp(input: { email: string; password: string; displayName?: string }): Promise<"signed_in" | "confirm_email"> {
      const p = signUpFormSchema.safeParse(input);
      if (!p.success) throw new AuthClientError("validation", fieldErrorsOf(p.error.issues));
      const { data, error } = await backend.signUp({
        email: p.data.email,
        password: p.data.password,
        options: p.data.displayName ? { data: { display_name: p.data.displayName } } : undefined,
      });
      if (error) throw mapBackendError(error);
      return data.session ? "signed_in" : "confirm_email";
    },

    async signIn(input: { email: string; password: string }): Promise<void> {
      const p = signInSchema.safeParse(input);
      if (!p.success) throw new AuthClientError("validation", fieldErrorsOf(p.error.issues));
      const { error } = await backend.signInWithPassword(p.data);
      if (error) throw mapBackendError(error);
    },

    async signOut(): Promise<void> {
      const { error } = await backend.signOut({ scope: "local" });
      if (error) throw mapBackendError(error);
    },

    async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
      const p = passwordResetRequestSchema.safeParse({ email });
      if (!p.success) throw new AuthClientError("validation", fieldErrorsOf(p.error.issues));
      const { error } = await backend.resetPasswordForEmail(p.data.email, { redirectTo });
      if (!error) return;
      const mapped = mapBackendError(error);
      if (mapped.code === "rate_limited" || mapped.code === "service_unavailable") throw mapped;
    },

    async setNewPassword(password: string): Promise<void> {
      const p = newPasswordSchema.safeParse({ password });
      if (!p.success) throw new AuthClientError("validation", fieldErrorsOf(p.error.issues));
      const { error } = await backend.updateUser({ password: p.data.password });
      if (error) throw mapBackendError(error);
    },

    async isSignedIn(): Promise<boolean> { return (await backend.getSession()).data.session !== null; },
    async getAccessToken(): Promise<string> { return accessToken(); },

    onAuthChange(cb: (event: string, signedIn: boolean) => void): () => void {
      const { data } = backend.onAuthStateChange((event, session) => cb(event, session !== null));
      return () => data.subscription.unsubscribe();
    },

    async fetchMe(): Promise<Me> { return (await apiCall<Me>("/me")) as Me; },
    async listSessions(): Promise<DeviceSession[]> { return ((await apiCall<{ sessions: DeviceSession[] }>("/me/sessions")) as { sessions: DeviceSession[] }).sessions; },
    async revokeSession(id: string): Promise<void> { await apiCall(`/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }); },
    async apiRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T | undefined> { return apiCall<T>(path, init); },
    getSupabaseClient: () => supabase,
  };
}
export type AuthClient = ReturnType<typeof createAuthClient>;
