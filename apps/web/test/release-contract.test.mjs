import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("stable direct-entry aliases exist for core Sidle destinations", () => {
  const config = read("next.config.mjs");
  for (const route of [
    "/discover",
    "/connections",
    "/messages",
    "/community",
    "/profile/edit",
    "/settings",
    "/settings/privacy",
    "/settings/account",
    "/settings/notifications",
  ]) {
    assert.match(config, new RegExp(`\\[?\"${route.replaceAll("/", "\\/")}\"`));
  }
});

test("password recovery follows the shared eight-character minimum and requires confirmation", () => {
  const reset = read("app/reset/page.tsx");
  assert.match(reset, /password\.length < 8/);
  assert.match(reset, /confirmPassword/);
  assert.match(reset, /password !== confirmPassword/);
  assert.doesNotMatch(reset, /password\.length < 6/);
});

test("help, recovery and unknown-route surfaces are present", () => {
  assert.equal(existsSync(resolve(process.cwd(), "app/help/page.tsx")), true);
  assert.equal(existsSync(resolve(process.cwd(), "app/error.tsx")), true);
  assert.equal(existsSync(resolve(process.cwd(), "app/not-found.tsx")), true);
  assert.equal(existsSync(resolve(process.cwd(), "app/robots.ts")), true);

  const settings = read("app/settings-overview.tsx");
  assert.match(settings, /href="\/help"/);
});

test("profile preview exposes saved media and privacy context without claiming identity verification", () => {
  const profile = read("app/my-profile-view.tsx");
  assert.match(profile, /my-profile-photo-grid/);
  assert.match(profile, /Current privacy boundary/);
  assert.match(profile, /Academic email confirmed/);
  assert.doesNotMatch(profile, /Campus Verified Student/);
});

test("messaging preserves drafts, supports retry and does not call realtime presence online", () => {
  const messages = read("app/messages.tsx");
  assert.match(messages, /sidle-message-draft:/);
  assert.match(messages, /sessionStorage\.setItem/);
  assert.match(messages, />Retry</);
  assert.match(messages, /Live updates connected/);
  assert.doesNotMatch(messages, /Online · Real-time/);
});

test("privacy and notification pages disclose save and delivery state", () => {
  const privacy = read("app/privacy-settings.tsx");
  const notifications = read("app/notification-settings.tsx");
  assert.match(privacy, /unsaved privacy changes/i);
  assert.match(privacy, /Previous connections are not restored/);
  assert.match(notifications, /Mobile push delivery is disabled/);
  assert.match(notifications, /browser push are not implemented yet/);
});

test("shell lifecycle tracks titles and browser connectivity", () => {
  const shell = read("app/shell-accessibility.tsx");
  assert.match(shell, /document\.title/);
  assert.match(shell, /addEventListener\("offline"/);
  assert.match(shell, /addEventListener\("online"/);
  assert.match(shell, /Browser is offline/);
});

test("web platform applies baseline security headers and installable shortcuts", () => {
  const config = read("next.config.mjs");
  const manifest = read("app/manifest.ts");
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Permissions-Policy/);
  assert.match(config, /poweredByHeader: false/);
  assert.match(manifest, /shortcuts/);
  assert.match(manifest, /url: '\/messages'/);
});
