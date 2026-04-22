import { test as setup, Browser } from '@playwright/test';
import {
  USERS,
  UserKey,
  loginAs,
  storageStatePath,
  ensureAuthDir,
} from './auth';

/**
 * Auth setup – runs once before any test project that depends on it.
 * Logs in as every user defined in USERS and persists their storage state
 * to playwright/.auth/<storageKey>.json so tests can reuse it without
 * repeating the login flow.
 */
setup('authenticate all users', async ({ browser }: { browser: Browser }) => {
  ensureAuthDir();

  for (const key of Object.keys(USERS) as UserKey[]) {
    const user = USERS[key];

    console.log(`🔐 Authenticating "${key}" (${user.username})…`);

    const context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/New_York',
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    try {
      await loginAs(page, user);
      await context.storageState({ path: storageStatePath(key) });
      console.log(
        `✅ Saved storage state for "${key}" → ${storageStatePath(key)}`
      );
    } catch (err) {
      console.error(`❌ Failed to authenticate "${key}":`, err);
      throw err;
    } finally {
      await context.close();
    }
  }
});
