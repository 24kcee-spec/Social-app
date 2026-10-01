/**
 * Which browser origins may call the API.
 * - CORS_ORIGINS (comma-separated, exact origins) wins when set.
 * - Otherwise local development allows the Next.js dev server only.
 * - Staging/production with nothing set = no browser access (fail closed).
 * Native apps do not use CORS, so this only matters for the web app.
 */
export function resolveCorsOrigins(env: { APP_ENV: string; CORS_ORIGINS?: string | undefined }): string[] {
  const listed = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter((o) => o.length > 0 && o !== "*");
  if (listed.length > 0) return [...new Set(listed)];
  return env.APP_ENV === "local" ? ["http://localhost:3000", "http://127.0.0.1:3000"] : [];
}
