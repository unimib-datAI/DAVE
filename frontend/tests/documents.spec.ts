import { test, expect, Page } from '@playwright/test';

/**
 * Navigate to the search page, perform an empty search and open the first document.
 * Throws if unable to find a document.
 */
async function openFirstDocument(page: Page) {
  const searchPaths = ['/holmes24/search', '/search', '/search/'];
  let foundSearch = false;

  for (const p of searchPaths) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    const searchInput = page.locator(
      'input[placeholder*="Search"], input[type="search"], input[aria-label*="search"]'
    );
    if ((await searchInput.count()) > 0) {
      foundSearch = true;
      break;
    }
  }

  if (!foundSearch) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const cta = page.locator(
      'button:has-text("See all documents"), a:has-text("See all documents"), a:has-text("Documents"), button:has-text("Documents")'
    );
    if ((await cta.count()) === 0) {
      throw new Error('Could not reach search page or CTA to documents');
    }
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
      cta.first().click(),
    ]);
  }

  const input = page
    .locator(
      'input[placeholder*="Search"], input[type="search"], input[aria-label*="search"]'
    )
    .first();
  if ((await input.count()) === 0) {
    throw new Error('Search input not found on search page');
  }

  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.focus();
  await input.press('Enter');

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);

  const resultLinks = page.locator(
    'a[href*="/documents/"], a[href*="/holmes24/documents/"]'
  );
  const count = await resultLinks.count();
  if (count === 0) {
    throw new Error('No document results found after empty search');
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
    resultLinks.first().click(),
  ]);

  await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 30000 });
}

/**
 * Wait for the "Edit clusters" button — used as the document ready signal.
 */
async function waitForDocumentReady(page: Page) {
  await page.getByRole('button', { name: 'Edit clusters' }).waitFor({
    state: 'visible',
    timeout: 45000,
  });
}

// ---------------------------------------------------------------------------

test.describe('Document page', () => {
  test.beforeEach(async ({ page }) => {
    await openFirstDocument(page);
    await waitForDocumentReady(page);
  });

  test('document content is loaded', async ({ page }) => {
    expect(page.url()).toMatch(/\/documents\/[^/]+$/);

    const editClustersButton = page.getByRole('button', {
      name: 'Edit clusters',
    });
    await expect(editClustersButton).toBeVisible({ timeout: 10000 });
    expect(
      (await editClustersButton.textContent())?.trim().length
    ).toBeGreaterThan(0);
  });

  test('clicking an entity node opens the entity detail panel', async ({
    page,
  }) => {
    // Use the data-entity-id attribute to find the first entity node reliably
    const entityNode = page.locator('[data-entity-id]').first();
    await entityNode.waitFor({ state: 'visible', timeout: 10000 });

    // Ensure the element is scrolled into view before clicking to avoid overlay/detached issues
    await entityNode.scrollIntoViewIfNeeded();

    // Prefer a normal click but fall back to a JS click if the element is detached or overlayed
    try {
      await entityNode.click();
    } catch {
      const handle = await entityNode.elementHandle();
      if (handle) {
        await page.evaluate((el) => (el as HTMLElement).click(), handle);
      }
    }

    // Some UIs render the annotation details inside a portal or with a heading.
    // Check for the 'Annotation details' heading text instead of relying on a specific test-id.
    const annotationDetailsHeading = page.getByText('Annotation details');
    await expect(annotationDetailsHeading).toBeVisible({ timeout: 8000 });
  });

  test('clicking a cluster item and then a mention works', async ({ page }) => {
    // Prefer clicking a cluster group element whose id starts with the fixed prefix.
    const clusterGroupAll = page.locator('[id^="cluster-group-"]');
    const clusterItem = page.locator('[data-testid="cluster-item"]').first();
    // Wait for either cluster-group elements or cluster items to appear
    const groupCount = await clusterGroupAll.count();
    // choose the preferred target: cluster-group if present, otherwise cluster-item
    const target = groupCount > 0 ? clusterGroupAll.first() : clusterItem;
    await target.waitFor({ state: 'visible', timeout: 10000 });
    // Ensure the target is visible in the viewport
    await target.scrollIntoViewIfNeeded();

    // Try several click strategies:
    // 1) normal click
    // 2) forced click (bypasses Playwright visibility/obstruction checks)
    // 3) DOM-eval click on the element handle (last resort)
    let clicked = false;
    try {
      await target.click();
      clicked = true;
    } catch (err) {
      // fallback: force click
      try {
        await target.click({ force: true });
        clicked = true;
      } catch (err2) {
        // last resort: call the element's click() in page context
        const handle = await target.elementHandle();
        if (handle) {
          await page.evaluate((el) => (el as HTMLElement).click(), handle);
          clicked = true;
        }
      }
    }

    if (!clicked) {
      throw new Error(
        'Failed to click cluster-group or cluster-item via normal, forced, and DOM-eval click methods'
      );
    }

    // After clicking the group/item, click the first element whose id starts with 'cluster-'
    // (the prefix is fixed; this targets elements like id="cluster-123" or id="cluster-REGULATION-1")
    const clusterById = page.locator('[id^="cluster-"]').first();
    if ((await clusterById.count()) > 0) {
      await clusterById.waitFor({ state: 'visible', timeout: 10000 });
      await clusterById.scrollIntoViewIfNeeded();

      let clickedClusterById = false;
      try {
        await clusterById.click();
        clickedClusterById = true;
      } catch (err) {
        try {
          await clusterById.click({ force: true });
          clickedClusterById = true;
        } catch {
          const handle = await clusterById.elementHandle();
          if (handle) {
            await page.evaluate((el) => (el as HTMLElement).click(), handle);
            clickedClusterById = true;
          }
        }
      }

      if (!clickedClusterById) {
        throw new Error(
          "Failed to click first element with id starting 'cluster-' via normal, forced, and DOM-eval methods"
        );
      }
    }

    const mention = page.locator('[data-testid="mention"]').first();
    await mention.waitFor({ state: 'visible', timeout: 10000 });
    await mention.click();
  });
});
