const { loadEnvFile } = require("node:process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const publisherAds = require("./admob.config.json");

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
// Public owner identifiers never enable live requests by themselves.
const mobileAdPreview = process.env.MOBILE_ADS_PREVIEW === "true";
if (easProfile === "production" && mobileAdPreview) {
  throw new Error("MOBILE_ADS_PREVIEW is only for an internal preview APK, not a production release.");
}
const sampleAndroidAdAppId = "ca-app-pub-3940256099942544~3347511713";
const publisherAndroidAdAppId = process.env.ADMOB_ANDROID_APP_ID?.trim() || publisherAds.androidAppId;
if (publisherAndroidAdAppId && (
  !/^ca-app-pub-[0-9]{16}~[0-9]{10}$/.test(publisherAndroidAdAppId) ||
  publisherAndroidAdAppId.startsWith("ca-app-pub-3940256099942544~")
)) {
  throw new Error("ADMOB_ANDROID_APP_ID must be your own AdMob app ID (with ~), not an ad-unit ID or a Google sample ID.");
}
const androidAdAppId = mobileAdPreview ? sampleAndroidAdAppId : publisherAndroidAdAppId || sampleAndroidAdAppId;
const androidBannerUnitId = process.env.ADMOB_ANDROID_BANNER_ID?.trim() || publisherAds.androidBannerUnitId;
const mobileAdsEnabled = process.env.MOBILE_ADS_ENABLED === "true";
if (mobileAdsEnabled) {
  if (mobileAdPreview || easProfile === "preview") {
    throw new Error("Live ads cannot run in an internal preview APK.");
  }
  if (process.env.COMMERCIAL_DEPLOYMENT_APPROVED !== "true") {
    throw new Error("Live ads require verified commercial-compatible hosting before MOBILE_ADS_ENABLED can be enabled.");
  }
  const publisher = publisherAndroidAdAppId.match(/^ca-app-(pub-[0-9]{16})~/)?.[1];
  if (!publisher || !new RegExp("^ca-app-" + publisher + "/[0-9]{10}$").test(androidBannerUnitId)) {
    throw new Error("ADMOB_ANDROID_BANNER_ID must be a banner unit belonging to the Android app's publisher.");
  }
  requirePublicHttpsUrl("SUPABASE_URL");
  requirePublicHttpsUrl("MOBILE_API_URL");
  requirePublicHttpsUrl("PUBLIC_WEB_URL");
  if (!process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.ANDROID_PACKAGE !== "app.kcee24.sidle") {
    throw new Error("Live Sidle ads require the public Supabase key and the stable app.kcee24.sidle package.");
  }
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
    version: "0.0.2",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "socialapp",
    plugins: [["expo-image-picker", { photosPermission: "Allow Sidle to use your photos for your profile." }], "expo-notifications",
      ["react-native-google-mobile-ads", { androidAppId: androidAdAppId, iosAppId: "ca-app-pub-3940256099942544~1458002511", delayAppMeasurementInit: true }]
    ],
    ios: {
      supportsTablet: false,
      infoPlist:{NSCameraUsageDescription:"Allow Sidle to use your camera when you start video.",NSMicrophoneUsageDescription:"Allow Sidle to record voice and place calls when you choose.",NSLocationWhenInUseUsageDescription:"Allow Sidle to share your location with selected connections while this screen is open."},
      bundleIdentifier: process.env.IOS_BUNDLE_IDENTIFIER?.trim() || "app.social.dev",
      associatedDomains: linkHost ? [`applinks:${linkHost}`] : [],
    },
    android: {
      package: androidPackage,
      versionCode: 2,
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
      mobileAdsEnabled,
      ...(mobileAdsEnabled ? { admobBannerUnitId: androidBannerUnitId } : {}),
    },
  },
};
