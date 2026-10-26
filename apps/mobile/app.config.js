const { loadEnvFile } = require("node:process");
const { readFileSync } = require("node:fs");
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.EAS_PROJECT_ID || "")) {
    throw new Error("Android EAS builds require EAS_PROJECT_ID from the linked Expo project.");
  }
}

const webUrl = process.env.PUBLIC_WEB_URL || "http://localhost:3000";
const linkHost = new URL(webUrl).protocol === "https:" ? new URL(webUrl).hostname : null;
// Google's official Android sample app ID: preview integration never earns revenue.
const mobileAdPreview = process.env.MOBILE_ADS_PREVIEW === "true";
if (easProfile === "production" && mobileAdPreview) {
  throw new Error("MOBILE_ADS_PREVIEW is only for an internal preview APK, not a production release.");
}

const androidPackage = process.env.ANDROID_PACKAGE?.trim() || "app.social.dev";
const androidGoogleServicesFile = process.env.ANDROID_GOOGLE_SERVICES_FILE?.trim();
if (androidGoogleServicesFile) {
  let firebase;
  try {
    const filename = path.resolve(__dirname, androidGoogleServicesFile);
    firebase = JSON.parse(readFileSync(filename, "utf8"));
  } catch {
    throw new Error("ANDROID_GOOGLE_SERVICES_FILE must point to a readable Firebase Android google-services.json file.");
  }
  if (firebase?.type === "service_account" || firebase?.private_key || firebase?.private_key_id) {
    throw new Error("Never bundle an FCM service-account private key. ANDROID_GOOGLE_SERVICES_FILE requires the client google-services.json; upload the FCM v1 service account to EAS credentials separately.");
  }
  const clients = Array.isArray(firebase?.client) ? firebase.client : [];
  if (!firebase?.project_info?.project_number || !clients.some((client) =>
    client?.client_info?.android_client_info?.package_name === androidPackage &&
    client?.client_info?.mobilesdk_app_id
  )) {
    throw new Error("Firebase google-services.json must contain an Android client matching ANDROID_PACKAGE.");
  }
}
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
    plugins: [["expo-image-picker", { photosPermission: "Allow Sidle to use your photos for your profile." }], "expo-notifications",
      ["react-native-google-mobile-ads", { androidAppId: "ca-app-pub-3940256099942544~3347511713", iosAppId: "ca-app-pub-3940256099942544~1458002511", delayAppMeasurementInit: true }]
    ],
    ios: {
      supportsTablet: false,
      infoPlist:{NSCameraUsageDescription:"Allow Sidle to use your camera when you start video.",NSMicrophoneUsageDescription:"Allow Sidle to record voice and place calls when you choose.",NSLocationWhenInUseUsageDescription:"Allow Sidle to share your location with selected connections while this screen is open."},
      bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER?.trim() || "app.social.dev",
      associatedDomains: linkHost ? [`applinks:${linkHost}`] : [],
    },
    android: {
      package: androidPackage,
      ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
      permissions:["CAMERA","RECORD_AUDIO","ACCESS_COARSE_LOCATION","ACCESS_FINE_LOCATION"],
      adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#F7F6F2" },
      intentFilters: linkHost ? [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: linkHost,
              pathPrefix: "/share",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ] : [],
    },
    extra: {
      ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
      supabaseUrl: process.env.SUPABASE_URL ?? "",
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      // Local development may use a LAN IP; a remotely installed APK must use a reachable HTTPS API.
      apiUrl: process.env.MOBILE_API_URL || "http://localhost:4000",
      // Where password-reset emails send the user (the web app's /reset page).
      webUrl: process.env.PUBLIC_WEB_URL || "http://localhost:3000",
      mobileAdPreview,
    },
  },
};
