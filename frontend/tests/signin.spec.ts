import { test, expect, chromium } from '@playwright/test';
import { USERS, UserKey, loginAs, storageStatePath } from './auth';

// ─── Parameterised login tests ────────────────────────────────────────────────
//
// Each entry in USERS gets its own "should login successfully" test so you can
// instantly spot which account is broken.

for (const key of Object.keys(USERS) as UserKey[]) {
  const user = USERS[key];

  test(`should login successfully as "${key}" (${user.username})`, async ({ page }) => {
    await loginAs(page, user);

    // Must have left the sign-in page
    expect(page.url()).not.toContain('/sign-in');

    // Must still be inside the app
    expect(page.url()).toContain('/holmes24');
  });
}

// ─── Auth-state persistence check ────────────────────────────────────────────
//
// Verifies that the storage state saved by auth.setup.ts is actually usable:
// load it into a fresh context and confirm we land on an authenticated page
// without going through the login form.

for (const key of Object.keys(USERS) as UserKey[]) {
  const user = USERS[key];

  test(`should restore session from saved state for "${key}"`, async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({
      storageState: storageStatePath(key),
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    const page = await context.newPage();

    try {
      await page.goto('http://localhost:3010/holmes24', { waitUntil: 'networkidle' });

      // Should NOT be redirected back to sign-in
      expect(page.url()).not.toContain('/sign-in');
      expect(page.url()).toContain('/holmes24');
    } finally {
      await browser.close();
    }
  });
}

// ─── Sign-in page behaviour ───────────────────────────────────────────────────

test.describe('Sign-in page', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // always unauthenticated

  test('should show the Keycloak sign-in button', async ({ page }) => {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');

    const btn = page.locator('button').filter({ hasText: /sign in with keycloak/i }).first();
    await expect(btn).toBeVisible();
  });

  test('should redirect to Keycloak when clicking sign-in button', async ({ page }) => {
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');

    await page.locator('button').filter({ hasText: /sign in/i }).first().click();

    // Keycloak login form should appear
    await page.waitForSelector('#username', { state: 'visible', timeout: 15_000 });
    await page.waitForSelector('#password', { state: 'visible', timeout: 15_000 });

    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });
});
