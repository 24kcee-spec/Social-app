import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('shell keeps a working skip-link target and installs the accessibility controller', () => {
  const layout = read('app/layout.tsx');
  const page = read('app/page.tsx');

  assert.match(layout, /href=['"]#main['"]/);
  assert.match(layout, /<ShellAccessibility\s*\/>/);
  assert.match(page, /<main id=['"]main['"] tabIndex=\{-1\}>/);
});

test('primary navigation semantics and SPA focus restoration are enforced', () => {
  const runtime = read('app/shell-accessibility.tsx');

  const header = read('app/app-header.tsx');
  assert.match(header, /aria-current=/);
  assert.match(header, /<UiIcon/);
  assert.match(header, /aria-label="Main Navigation"/);
  assert.match(runtime, /window\.history\.pushState = patchedPushState/);
  assert.match(runtime, /window\.history\.replaceState = patchedReplaceState/);
  assert.match(runtime, /window\.addEventListener\(['"]popstate['"], announceNavigation\)/);
  assert.match(runtime, /target\.focus\(\{ preventScroll: Boolean\(sectionTarget\) \}\)/);
});

test('release CSS preserves visible focus, touch targets, small-screen containment and forced-colour support', () => {
  const css = read('app/release-hardening.css');

  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
});

test('profile editors retain browser leave protection for unsaved drafts', () => {
  const page = read('app/page.tsx');
  const privacy = read('app/privacy-settings.tsx');

  assert.match(page, /window\.addEventListener\(['"]beforeunload['"], warnBeforeLeaving\)/);
  assert.match(privacy, /window\.addEventListener\('beforeunload', warn\)/);
});
