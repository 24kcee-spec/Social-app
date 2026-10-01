import { fileURLToPath } from "node:url";

// One .env at the repo root feeds the API, web and mobile. Only PUBLIC values are exposed to the browser:
// the Supabase URL, the PUBLISHABLE key and the API address. Never the database URL or the secret key.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch (err) {
  if (err?.code !== "ENOENT") throw err;
}

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  transpilePackages: ["@sp/auth-client", "@sp/validation", "@sp/types"],
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    NEXT_PUBLIC_API_URL: process.env.PUBLIC_API_URL || "http://localhost:4000",
  },
};
