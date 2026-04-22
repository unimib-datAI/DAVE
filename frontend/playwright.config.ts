import { defineConfig, devices } from '@playwright/test';
import { USERS, UserKey, storageStatePath } from './tests/auth';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3010/holmes24',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },

  projects: [
    // ── 1. Auth setup ─────────────────────────────────────────────────────────
    // Runs once before any dependent project. Logs in as every user defined in
    // USERS and persists their storage state to playwright/.auth/<key>.json.
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        locale: 'en-US',
        storageState: { cookies: [], origins: [] }, // always start clean
      },
    },

    // ── 2. Sign-in spec ───────────────────────────────────────────────────────
    // Tests the login flow itself – also runs with a clean browser so it can
    // go through the Keycloak form without an existing session interfering.
    {
      name: 'signin',
      testMatch: /signin\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: {
        locale: 'en-US',
        storageState: { cookies: [], origins: [] },
      },
    },

    // ── 3. Per-user authenticated projects ────────────────────────────────────
    // One project per entry in USERS so you can target a specific account with
    //   npx playwright test --project=as-admin
    // or let them all run in the default suite.
    ...(Object.keys(USERS) as UserKey[]).map((key) => ({
      name: `as-${key}`,
      dependencies: ['auth-setup'],
      testIgnore: [/auth\.setup\.ts/, /signin\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        locale: 'en-US',
        timezoneId: 'America/New_York',
        storageState: storageStatePath(key),
      },
    })),
  ],
});
