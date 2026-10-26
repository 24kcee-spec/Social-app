const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const appDir = path.resolve(__dirname, "..");
const eas = JSON.parse(fs.readFileSync(path.join(appDir, "eas.json"), "utf8"));

assert.equal(eas.build.preview.distribution, "internal", "preview must be internally distributed");
assert.equal(eas.build.preview.environment, "preview", "preview must use the preview EAS environment");
assert.equal(eas.build.preview.android.buildType, "apk", "Android preview must produce an installable APK");
assert.equal(eas.build.production.environment, "production", "production must use the production EAS environment");
assert.equal(eas.build.production.autoIncrement, true, "production version numbers must auto-increment");

const validEnv = {
  EAS_BUILD_PROFILE: "preview",
  SUPABASE_URL: "https://social-app.supabase.invalid",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
  MOBILE_API_URL: "https://api.social-app.invalid",
  PUBLIC_WEB_URL: "https://social-app.invalid",
  EAS_PROJECT_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ANDROID_PACKAGE: "",
  MOBILE_ADS_PREVIEW: "",
  ADMOB_ANDROID_APP_ID: "",
  ADMOB_ANDROID_BANNER_ID: "",
  MOBILE_ADS_ENABLED: "",
  COMMERCIAL_DEPLOYMENT_APPROVED: "",
  ANDROID_GOOGLE_SERVICES_FILE: ""
};

function loadConfig(profile, overrides = {}) {
  const env = { ...process.env, ...validEnv, EAS_BUILD_PROFILE: profile, ...overrides };
  return spawnSync(process.execPath, ["-e", "require('./app.config.js')"], {
    cwd: appDir,
    env,
    encoding: "utf8"
  });
}

function expectFailure(result, message, label) {
  const output = (result.stdout || "") + "\n" + (result.stderr || "");
  assert.notEqual(result.status, 0, label + ": expected config loading to fail");
  assert.ok(output.includes(message), label + ': expected error containing "' + message + '", received:\n' + output);
}

const preview = loadConfig("preview");
assert.equal(preview.status, 0, "valid preview config should load:\n" + preview.stderr);

expectFailure(loadConfig("preview", { EAS_PROJECT_ID: "" }), "EAS_PROJECT_ID", "unlinked EAS project");
const resolved = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./app.config.js')))"], { cwd: appDir, env: { ...process.env, ...validEnv }, encoding: "utf8" });
const appConfig = JSON.parse(resolved.stdout).expo;
assert.equal(appConfig.android.intentFilters[0].data[0].host, "social-app.invalid");
assert.deepEqual(appConfig.ios.associatedDomains, ["applinks:social-app.invalid"]);
assert.equal(appConfig.extra.eas.projectId, validEnv.EAS_PROJECT_ID);

const publisherId = "ca-app-pub-1234567890123456~1234567890";
for (const invalid of [publisherId.replace("~", "/"), "ca-app-pub-3940256099942544~3347511713", "invalid"]) {
  expectFailure(loadConfig("preview", { ADMOB_ANDROID_APP_ID: invalid }), "your own AdMob app ID", "wrong advertising identifier");
}
for (const testMode of [false, true]) {
  const config = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./app.config.js')))"], {
    cwd: appDir,
    env: { ...process.env, ...validEnv, ADMOB_ANDROID_APP_ID: publisherId, MOBILE_ADS_PREVIEW: String(testMode) },
    encoding: "utf8"
  });
  assert.equal(config.status, 0, config.stderr);
  const ads = JSON.parse(config.stdout).expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "react-native-google-mobile-ads");
  assert.equal(ads[1].androidAppId, testMode ? "ca-app-pub-3940256099942544~3347511713" : publisherId);
  assert.equal(ads[1].delayAppMeasurementInit, true);
}
assert.equal(appConfig.extra.mobileAdsEnabled, false, "publisher IDs alone must not enable live requests");
assert.equal(appConfig.extra.admobBannerUnitId, undefined, "disabled builds do not expose a live unit to the UI");
const liveEnv = { ANDROID_PACKAGE: "app.kcee24.sidle", MOBILE_ADS_ENABLED: "true", COMMERCIAL_DEPLOYMENT_APPROVED: "true" };
expectFailure(loadConfig("preview", liveEnv), "Live ads cannot run", "live ad requests in an internal build");
expectFailure(loadConfig("production", { ...liveEnv, COMMERCIAL_DEPLOYMENT_APPROVED: "false" }), "commercial-compatible hosting", "commercial hosting not verified");
expectFailure(loadConfig("production", { ...liveEnv, ADMOB_ANDROID_BANNER_ID: "ca-app-pub-9999999999999999/1234567890" }), "belonging to the Android app's publisher", "banner belongs to another publisher");
const live = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./app.config.js')))"], {
  cwd: appDir, env: { ...process.env, ...validEnv, EAS_BUILD_PROFILE: "production", ...liveEnv }, encoding: "utf8"
});
assert.equal(live.status, 0, live.stderr);
const liveConfig = JSON.parse(live.stdout).expo;
const ownerAds = require('../admob.config.json');
assert.equal(liveConfig.extra.mobileAdsEnabled, true);
assert.equal(liveConfig.extra.admobBannerUnitId, ownerAds.androidBannerUnitId);
assert.ok(ownerAds.androidAppId.startsWith("ca-app-" + ownerAds.publisherId + "~"));
assert.ok(ownerAds.androidBannerUnitId.startsWith("ca-app-" + ownerAds.publisherId + "/"));

const missingApi = loadConfig("preview", { MOBILE_API_URL: "" });
expectFailure(missingApi, "MOBILE_API_URL", "missing preview API URL");

const insecureApi = loadConfig("preview", { MOBILE_API_URL: "http://api.social-app.invalid" });
expectFailure(insecureApi, "HTTPS", "HTTP API URL");

const missingKey = loadConfig("preview", { SUPABASE_PUBLISHABLE_KEY: "" });
expectFailure(missingKey, "SUPABASE_PUBLISHABLE_KEY", "missing Supabase publishable key");

const missingAndroidId = loadConfig("production", { ANDROID_PACKAGE: "" });
expectFailure(missingAndroidId, "ANDROID_PACKAGE", "missing production Android ID");

const production = loadConfig("production", { ANDROID_PACKAGE: "com.socialapp.mobile" });
assert.equal(production.status, 0, "valid production config should load:\n" + production.stderr);
expectFailure(loadConfig("production", { ANDROID_PACKAGE: "com.socialapp.mobile", MOBILE_ADS_PREVIEW: "true" }), "internal preview APK", "test ads must not be mistaken for a production release");

// Firebase has two very different JSON files: only the Android client config may
// enter an APK. Reject a server private key before spending a cloud build slot.
const firebaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sidle-firebase-config-"));
try {
  const filename = path.join(firebaseDirectory, "google-services.json");
  fs.writeFileSync(filename, JSON.stringify({
    project_info: { project_number: "1234567890" },
    client: [{ client_info: { mobilesdk_app_id: "1:1234567890:android:fixture", android_client_info: { package_name: "com.socialapp.mobile" } } }]
  }));
  const env = { ...process.env, ...validEnv, ANDROID_PACKAGE: "com.socialapp.mobile", ANDROID_GOOGLE_SERVICES_FILE: filename };
  const firebaseConfig = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./app.config.js')))"], { cwd: appDir, env, encoding: "utf8" });
  assert.equal(firebaseConfig.status, 0, "matching Firebase client config should load:\n" + firebaseConfig.stderr);
  assert.equal(JSON.parse(firebaseConfig.stdout).expo.android.googleServicesFile, filename);
  expectFailure(loadConfig("preview", { ANDROID_GOOGLE_SERVICES_FILE: filename, ANDROID_PACKAGE: "com.other.mobile" }), "matching ANDROID_PACKAGE", "wrong Firebase app ID");
  fs.writeFileSync(filename, JSON.stringify({ type: "service_account", private_key: "PRIVATE_KEY_MUST_NEVER_APPEAR_IN_OUTPUT" }));
  const serverKey = loadConfig("preview", { ANDROID_GOOGLE_SERVICES_FILE: filename });
  expectFailure(serverKey, "Never bundle an FCM service-account private key", "server credential passed as client config");
  assert.ok(!serverKey.stderr.includes("PRIVATE_KEY_MUST_NEVER_APPEAR_IN_OUTPUT"));
  fs.writeFileSync(filename, '{"private_key":"PRIVATE_KEY_MUST_NEVER_APPEAR_IN_OUTPUT",');
  const malformed = loadConfig("preview", { ANDROID_GOOGLE_SERVICES_FILE: filename });
  expectFailure(malformed, "readable Firebase Android google-services.json", "malformed provider file");
  assert.ok(!malformed.stderr.includes("PRIVATE_KEY_MUST_NEVER_APPEAR_IN_OUTPUT"));
} finally {
  fs.rmSync(firebaseDirectory, { recursive: true, force: true });
}

console.log("Mobile EAS config checks passed (preview APK, HTTPS/API and app-ID guards, Firebase package matching, and server-key exclusion).");
