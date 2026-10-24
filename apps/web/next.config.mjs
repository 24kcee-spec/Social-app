import { fileURLToPath } from "node:url";

// One .env at the repo root feeds the API, web and mobile. Only PUBLIC values are exposed to the browser:
// the Supabase URL, the PUBLISHABLE key and the API address. Never the database URL or the secret key.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch (err) {
  if (err?.code !== "ENOENT") throw err;
}

const shellRedirects = [
  ["/discover", "/?tab=discover"],
  ["/connections", "/?tab=connections"],
  ["/messages", "/?tab=messages"],
  ["/community", "/?tab=community"],
  ["/profile", "/?view=profile-preview"],
  ["/profile/edit", "/?tab=profile&section=profile-details"],
  ["/settings", "/?view=settings"],
  ["/settings/privacy", "/?tab=profile&section=privacy-settings"],
  ["/settings/account", "/?tab=profile&section=account-sessions"],
  ["/settings/data", "/?tab=profile&section=account-data"],
  ["/settings/notifications", "/?view=notifications"],
].map(([source, destination]) => ({ source, destination, permanent: false }));

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

/** @type {import('next').NextConfig} */
export default {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@sp/auth-client", "@sp/profile-client", "@sp/validation", "@sp/types"],
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    NEXT_PUBLIC_API_URL: process.env.PUBLIC_API_URL || "http://localhost:4000",
  },
  async redirects() {
    return shellRedirects;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
