import { defineConfig } from '@playwright/test';

// Deterministic UI tests use synthetic provider/API responses. Never build this
// configuration into a production deployment or attach production credentials.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm exec next start -p 3100 -H 127.0.0.1',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      SUPABASE_URL: 'https://browser-fixture.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'browser-fixture-publishable',
      PUBLIC_API_URL: 'http://127.0.0.1:4400',
      PUBLIC_WEB_URL: 'http://127.0.0.1:3100',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
