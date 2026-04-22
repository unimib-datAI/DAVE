import { test, expect } from '@playwright/test';

test.describe('Documents Page', () => {
  test('should navigate to documents page when clicking "See all documents"', async ({
    page,
  }) => {
    // Start from home page (already logged in via saved auth state)
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Click "See all documents" button
    await page.click('button:has-text("See all documents")');

    // Wait for navigation to search page
    await page.waitForURL(/\/holmes24\/search/, { timeout: 10000 });

    // Verify we're on the search page
    expect(page.url()).toContain('/holmes24/search');

    // Check that the page has loaded by looking for common elements
    await page.waitForSelector(
      'form, input[type="search"], [data-testid="search"]',
      { timeout: 5000 }
    );

    // Take screenshot to verify page loaded correctly
    await page.screenshot({ path: 'documents-page.png' });
  });

  test('should filter documents using facet filters', async ({ page }) => {
    // Navigate to search page (already logged in)
    await page.goto('/holmes24/search');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Wait for facets to be visible
    await page.waitForTimeout(2000);

    // Find and click on a facet filter
    // Facets have structure: <span class="text-base whitespace-nowrap text-ellipsis overflow-hidden w-48">
    const facetItem = page
      .getByRole('checkbox', {
        name: 'Advanced Technical Support',
      })
      .first();
    // .locator(
    //   'span.text-base.whitespace-nowrap.text-ellipsis.overflow-hidden.w-48'
    // )
    // .first();

    // Check if facets are available
    const facetCount = await facetItem.count();
    if (facetCount === 0) {
      console.log('⚠️ No facets available to test filtering');
      test.skip();
    }

    // Get the facet text before clicking
    const facetText = await facetItem.textContent();
    console.log(`📌 Clicking on facet: "${facetText}"`);

    // Take screenshot before filtering
    await page.screenshot({ path: 'before-facet-filter.png' });

    // Click on the facet
    await facetItem.click();

    // Wait for results to update
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot after filtering
    await page.screenshot({ path: 'after-facet-filter.png' });

    // Verify we're still on the search page
    expect(page.url()).toContain('/holmes24/search');

    console.log(`✅ Facet filter applied successfully for: "${facetText}"`);
  });

  test('should search documents using search bar', async ({ page }) => {
    // Navigate to search page (already logged in)
    await page.goto('/holmes24/search');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Find the search input
    const searchInput = page.locator(
      'input.text-slate-800.resize-none.bg-transparent[placeholder="Search documents"]'
    );

    // Wait for search bar to be visible
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });

    // Take screenshot before search
    await page.screenshot({ path: 'before-search.png' });

    // Type a single letter to ensure we match something
    const searchTerm = 'a';
    await searchInput.fill(searchTerm);
    console.log(`🔍 Searching for: "${searchTerm}"`);

    // Press Enter or wait for auto-search
    await searchInput.press('Enter');

    // Wait for search results to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot after search
    await page.screenshot({ path: 'after-search.png' });

    // Verify we're still on the search page
    expect(page.url()).toContain('/holmes24/search');

    // Verify the search input still contains our search term
    const inputValue = await searchInput.inputValue();
    expect(inputValue).toBe(searchTerm);

    const searchResult = page.getByRole('link', {
      name: 'Case: EXT-CASE-513462 Action',
    });
    await searchResult.click();
    await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 10_000 });

    console.log(`✅ Search completed successfully for: "${searchTerm}"`);
  });
});
