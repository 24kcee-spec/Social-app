import { z } from "zod";

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const apiEnvSchema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(4000)),
    DATABASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
    SUPABASE_PUBLISHABLE_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
    CORS_ORIGINS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== "local" && !env.DATABASE_URL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL"], message: "Required when APP_ENV is staging or production" });
    }
    if (env.APP_ENV !== "local" && !env.SUPABASE_URL) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SUPABASE_URL"], message: "Required when APP_ENV is staging or production" });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Parses and validates API environment variables. Throws one readable error listing every problem. Never prints values. */
export function loadApiEnv(source: Record<string, string | undefined>): ApiEnv {
  const result = apiEnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}
