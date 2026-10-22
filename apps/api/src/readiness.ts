import type { ApiEnv } from "@sp/config";

/** Required env fields for serving authenticated product routes. */
type RequiredApiConfiguration = Pick<ApiEnv, "DATABASE_URL" | "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY">;

/** Returns a readiness check that reports missing variable names without exposing any values. */
export function createApiConfigurationCheck(env: RequiredApiConfiguration): () => Promise<void> {
  return async () => {
    const missing: string[] = [];
    if (!env.DATABASE_URL) missing.push("DATABASE_URL");
    if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!env.SUPABASE_PUBLISHABLE_KEY) missing.push("SUPABASE_PUBLISHABLE_KEY");
    if (missing.length > 0) {
      throw new Error(`Missing required API configuration: ${missing.join(", ")}`);
    }
  };
}
