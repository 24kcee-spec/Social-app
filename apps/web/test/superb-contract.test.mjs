import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

const exists = (path) => existsSync(resolve(process.cwd(), path));

test('the 88-point product vision is committed in Documents', () => {
  const path = resolve(process.cwd(), '../../Documents/sidle_superb_product_vision_88.md');
  assert.equal(existsSync(path), true);
  const vision = readFileSync(path, 'utf8');
  assert.match(vision, /88\. \*\*Execute the redesign as one coordinated product pass/);
  assert.match(vision, /Do not build a TikTok-style endless feed/);
  assert.match(vision, /low-pressure, intent-based social discovery/i);
});

test('superb design system is loaded after legacy polish layers', () => {
  const layout = read('app/layout.tsx');
  assert.match(layout, /superb-design\.css/);
  assert.match(layout, /superb-pages\.css/);
  assert.match(layout, /superb-components\.css/);
  assert.match(layout, /plans-polish\.css/);
  assert.match(layout, /<ProductExperience \/>/);

  const design = read('app/superb-design.css');
  assert.match(design, /--sidle-brand:/);
  assert.match(design, /@media \(max-width: 720px\)/);
  assert.match(design, /grid-template-columns: repeat\(5, 1fr\)/);
  assert.match(design, /prefers-reduced-motion/);
  assert.match(design, /forced-colors/);
});

test('PWA enhancement never caches authenticated page HTML', () => {
  assert.equal(exists('app/offline/page.tsx'), true);
  assert.equal(exists('public/sw.js'), true);
  const worker = read('public/sw.js');
  assert.match(worker, /Never cache authenticated page HTML/);
  assert.match(worker, /request\.mode === ['"]navigate['"]/);
  assert.match(worker, /caches\.match\(['"]\/offline['"]\)/);
  assert.doesNotMatch(worker, /cache\.put\(request, response\.clone\(\)\).*navigate/s);
});

test('global product experience supports command navigation install and connectivity state', () => {
  const experience = read('app/product-experience.tsx');
  assert.match(experience, /metaKey \|\| event\.ctrlKey/);
  assert.match(experience, /beforeinstallprompt/);
  assert.match(experience, /serviceWorker\.register\(['"]\/sw\.js['"]/);
  assert.match(experience, /You’re offline/);
  assert.match(experience, /Help & safety/);
});

test('Discover is explainable tuneable saveable and undoable without public popularity', () => {
  const discover = read('app/discover.tsx');
  assert.match(discover, /Why you’re seeing/);
  assert.match(discover, /card\.reasons\.slice/);
  assert.match(discover, /getProductClient\(\)\s*\.setSaved/);
  assert.match(discover, /sync across devices/);
  assert.doesNotMatch(discover, /localStorage/);
  assert.match(discover, /undoSkip/);
  assert.match(discover, /Report profile/);
  assert.match(discover, /Tune my profile/);
  assert.match(discover, /Academic email/);
  assert.match(discover, /does\s+not\s+show\s+a\s+public\s+popularity\s+score/);
  assert.doesNotMatch(discover, /Campus Verified Student/);
});

test('connections support private account-synced organization', () => {
  const connections = read('app/connections.tsx');
  assert.match(connections, /getPreferences/);
  assert.match(connections, /setPreferences/);
  assert.doesNotMatch(connections, /localStorage/);
  assert.match(connections, /Friend/);
  assert.match(connections, /Classmate/);
  assert.match(connections, /Study/);
  assert.match(connections, /Networking/);
  assert.match(connections, /private and sync/i);
  assert.match(connections, /Withdraw hello/);
  assert.doesNotMatch(connections, /Campus Verified Student/);
});

test('plans are a first-class native route while reusing the community contract', () => {
  const config = read('next.config.mjs');
  const manifest = read('app/manifest.ts');
  const plans = read('app/plans/page.tsx');
  assert.equal(exists('app/plans/page.tsx'), true);
  assert.doesNotMatch(config, /\[['"]\/plans['"], ['"]\/\?tab=community['"]\]/);
  assert.match(plans, /<Community \/>/);
  assert.match(plans, /Plans & communities/);
  assert.match(manifest, /name: 'Plans'/);
  assert.match(manifest, /url: '\/plans'/);
});

test('admin operations surface is backed by protected existing APIs', () => {
  assert.equal(exists('app/admin/page.tsx'), true);
  const admin = read('app/admin/page.tsx');
  const client = read('../../packages/profile-client/src/connections.ts');
  assert.match(admin, /roles\.includes\(['"]admin['"]\)/);
  assert.match(admin, /getActivationSummary\(30\)/);
  assert.match(admin, /listReports/);
  assert.match(admin, /resolveReport/);
  assert.match(client, /\/admin\/activation\/summary/);
});

test('public trust surfaces exist without inventing operational readiness', () => {
  for (const page of [
    'app/privacy/page.tsx',
    'app/community-guidelines/page.tsx',
    'app/whats-new/page.tsx',
  ]) {
    assert.equal(exists(page), true);
  }
  const privacy = read('app/privacy/page.tsx');
  const guidance = read('app/community-guidelines/page.tsx');
  assert.match(privacy, /not a substitute for a formally published legal privacy notice/i);
  assert.match(guidance, /does not currently publish an emergency-response service/i);
  assert.match(guidance, /real operational coverage/i);
});

test('feature flags are UX switches rather than authorization controls', () => {
  const flags = read('lib/feature-flags.ts');
  assert.match(flags, /never authorization controls/i);
  assert.match(flags, /commandPalette/);
  assert.match(flags, /recommendationTuning/);
  assert.match(flags, /savedIntroductions/);
});

test('telemetry seam is privacy-conscious and does not transmit', () => {
  const telemetry = read('lib/product-telemetry.ts');
  assert.match(telemetry, /intentionally do not transmit anything/i);
  assert.match(telemetry, /Never pass message bodies, emails, names/);
  assert.match(telemetry, /sessionStorage\.setItem/);
  assert.doesNotMatch(telemetry, /fetch\(/);
  assert.doesNotMatch(telemetry, /sendBeacon/);
});
