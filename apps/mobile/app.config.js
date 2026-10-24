const { loadEnvFile } = require("node:process");
const path = require("node:path");

// One .env at the repo root feeds API, web and mobile. Only PUBLIC values go into the app bundle.
try {
  loadEnvFile(path.join(__dirname, "..", "..", ".env"));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

const easProfile = process.env.EAS_BUILD_PROFILE;
const isRemoteTestOrProductionBuild = easProfile === "preview" || easProfile === "production";

function requirePublicHttpsUrl(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("Android EAS " + easProfile + " builds require " + name + " to be configured.");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(name + " must be a valid HTTPS URL for Android EAS " + easProfile + " builds.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  ) {
    throw new Error(name + " must use a publicly reachable HTTPS URL, not a local development address.");
  }
}

if (isRemoteTestOrProductionBuild) {
  requirePublicHttpsUrl("SUPABASE_URL");
  requirePublicHttpsUrl("MOBILE_API_URL");
  requirePublicHttpsUrl("PUBLIC_WEB_URL");

  if (!process.env.SUPABASE_PUBLISHABLE_KEY?.trim()) {
    throw new Error("Android EAS " + easProfile + " builds require SUPABASE_PUBLISHABLE_KEY.");
  }
}

const androidPackage = process.env.ANDROID_PACKAGE?.trim() || "app.social.dev";
if (easProfile === "production") {
  const packageNamePattern = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
  if (!process.env.ANDROID_PACKAGE?.trim()) {
    throw new Error("Production Android builds require ANDROID_PACKAGE to be explicitly configured.");
  }
  if (
    !packageNamePattern.test(androidPackage) ||
    androidPackage === "app.social.dev" ||
    /\.(dev|local|test)$/i.test(androidPackage)
  ) {
    throw new Error("Production ANDROID_PACKAGE must be a valid, stable, non-development Android application ID.");
  }
}

module.exports = {
  expo: {
    name: "Sidle",
    slug: "social-app",
    version: "0.0.1",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "socialapp",
    plugins: [["expo-image-picker", { photosPermission: "Allow Sidle to use your photos for your profile." }]],
    ios: {
      supportsTablet: false,
      bundleIdentifier: "app.social.dev",
      associatedDomains: ["applinks:social-app.local"],
    },
    android: {
      package: androidPackage,
      adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#F7F6F2" },
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "socialapp" },
            {
              scheme: "https",
              host: "social-app.local",
              pathPrefix: "/share",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    extra: {
      supabaseUrl: process.env.SUPABASE_URL ?? "",
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      // Local development may use a LAN IP; a remotely installed APK must use a reachable HTTPS API.
      apiUrl: process.env.MOBILE_API_URL || "http://localhost:4000",
      // Where password-reset emails send the user (the web app's /reset page).
      webUrl: process.env.PUBLIC_WEB_URL || "http://localhost:3000",
    },
  },
};
