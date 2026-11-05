import { test, expect, Page } from '@playwright/test';
import eng from '../translation/eng';
import ita from '../translation/ita';

/**
 * Fast smoke checks to run after dependency updates (next, mongoose, axios,
 * zod, ...): every main page must render, none of its tRPC calls may fail
 * with a 5xx, there must be no uncaught browser exceptions, and no raw
 * translation keys may leak into the UI.
 *
 *   npx playwright test smoke --project=as-admin
 */

const BASE = '/holmes24';

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/search', name: 'search' },
  { path: '/collections', name: 'collections' },
  { path: '/settings', name: 'settings' },
  { path: '/settings/llm', name: 'settings/llm' },
  { path: '/annotation-configuration', name: 'annotation-configuration' },
  { path: '/admin', name: 'admin', adminOnly: true },
];

/** Records tRPC responses with status >= 500 and uncaught page errors. */
function watchForFailures(page: Page) {
  const serverErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/trpc/') && res.status() >= 500) {
      const proc = new URL(res.url()).pathname.split('/api/trpc/')[1];
      serverErrors.push(`${res.status()} ${proc}`);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  return { serverErrors, pageErrors };
}

test.describe('Smoke: pages render without server errors', () => {
  for (const { path, name, adminOnly } of PAGES) {
    test(`${name} loads`, async ({ page }, testInfo) => {
      test.skip(
        !!adminOnly && testInfo.project.name !== 'as-admin',
        'admin page needs the admin user',
      );
      const failures = watchForFailures(page);

      const response = await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle');

      expect(response?.status(), 'page status').toBeLessThan(400);
      await expect(page.locator('body')).not.toContainText(
        /Application error|Internal Server Error/i,
      );
      expect(failures.serverErrors, 'tRPC 5xx responses').toEqual([]);
      expect(failures.pageErrors, 'uncaught page errors').toEqual([]);
    });
  }
});

test.describe('Smoke: validation and API', () => {
  test('tRPC rejects invalid input with a 4xx, not a 5xx (zod)', async ({
    page,
  }) => {
    // `token` must be a string: a number has to fail zod validation.
    const input = encodeURIComponent(JSON.stringify({ token: 123 }));
    const res = await page.request.get(
      `${BASE}/api/trpc/collection.getAll?input=${input}`,
    );
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('tRPC accepts a valid unauthenticated-style query', async ({ page }) => {
    const input = encodeURIComponent(JSON.stringify({}));
    const res = await page.request.get(
      `${BASE}/api/trpc/collection.getAll?input=${input}`,
    );
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('Smoke: locale fallback', () => {
  async function setStoredLocale(page: Page, locale: string) {
    await page.addInitScript((value) => {
      localStorage.setItem('locale', value);
    }, locale);
  }

  test('an unsupported stored locale shows English, never raw keys', async ({
    page,
  }) => {
    const failures = watchForFailures(page);
    await setStoredLocale(page, 'zz');
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(eng.home.buttons.seeAllDocuments).first(),
    ).toBeVisible();
    // The key names (last path segment) must not be rendered as text.
    await expect(
      page.getByText('seeAllDocuments', { exact: true }),
    ).toHaveCount(0);
    expect(failures.pageErrors).toEqual([]);
  });

  test('an unsupported cookie locale does not break SSR pages', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'locale', value: 'zz', url: 'http://localhost:3010' },
    ]);
    const response = await page.goto(`${BASE}/settings`);
    await page.waitForLoadState('networkidle');

    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('body')).not.toContainText(
      /Application error|Internal Server Error/i,
    );
  });

  test('a supported stored locale (Italian) is applied', async ({ page }) => {
    test.skip(
      ita.home.buttons.seeAllDocuments === eng.home.buttons.seeAllDocuments,
      'Italian string identical to English, cannot tell them apart',
    );
    await setStoredLocale(page, 'ita');
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(ita.home.buttons.seeAllDocuments).first(),
    ).toBeVisible();
  });
});
