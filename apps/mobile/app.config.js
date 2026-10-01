const { loadEnvFile } = require("node:process");
const path = require("node:path");

// One .env at the repo root feeds API, web and mobile. Only PUBLIC values go into the app bundle.
try {
  loadEnvFile(path.join(__dirname, "..", "..", ".env"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

module.exports = {
  expo: {
    name: "Social app",
    slug: "social-app",
    version: "0.0.1",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ios: { supportsTablet: false, bundleIdentifier: "app.social.dev" },
    android: { package: "app.social.dev" },
    extra: {
      supabaseUrl: process.env.SUPABASE_URL ?? "",
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      // A phone cannot reach "localhost": set MOBILE_API_URL to http://<this PC's LAN IP>:4000 in .env.
      apiUrl: process.env.MOBILE_API_URL || "http://localhost:4000",
      // Where password-reset emails send the user (the web app's /reset page).
      webUrl: process.env.PUBLIC_WEB_URL || "http://localhost:3000",
    },
  },
};
