const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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
  ANDROID_PACKAGE: ""
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

console.log("Mobile EAS config checks passed (preview APK profile, HTTPS/API guards, and production app-ID guard).");
