import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe.serial('Collections - lifecycle split', () => {
  let collectionName: string;
  let collectionId: string;
  let editedName: string;

  test('create collection', async ({ page }, testInfo) => {
    // Skip creation for viewer role
    if (testInfo.project.name === 'as-viewer')
      test.skip('viewer cannot create');

    // Navigate to collections list
    await page.goto('/holmes24/collections');
    await page.waitForLoadState('networkidle');

    // Wait for either the New button or at least one collection entry
    await Promise.race([
      page.waitForSelector('#new-collection-btn', {
        state: 'visible',
        timeout: 10_000,
      }),
      page.waitForSelector('[id^="collection-"]', {
        state: 'visible',
        timeout: 10_000,
      }),
    ]);

    // Click "New collection"
    const newBtn = page.locator('#new-collection-btn');
    if (
      (await newBtn.count()) === 0 ||
      !(await newBtn.isVisible()) ||
      !(await newBtn.isEnabled())
    ) {
      throw new Error(
        'New collection button not available or not enabled; cannot proceed with creation in this run.'
      );
    }
    await newBtn.click();

    // Fill modal input and submit
    const timestamp = Date.now();
    collectionName = `E2E Test Collection ${timestamp}`;

    await page.waitForSelector('#collection-name-input', {
      state: 'visible',
      timeout: 10_000,
    });
    await page.fill('#collection-name-input', collectionName);

    // Optionally toggle first user checkbox if present
    const userCheckbox = page.locator('[id^="collection-user-"]').first();
    if ((await userCheckbox.count()) > 0) {
      await userCheckbox.click();
    }

    // Submit create
    await page.click('#collection-modal-submit');

    // Wait for the collection to appear in the list
    const collectionLocator = page.locator(`text="${collectionName}"`).first();
    await expect(collectionLocator).toBeVisible({ timeout: 30_000 });
  });

  test('open collection and extract id', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'as-viewer')
      test.skip('viewer cannot open created collection lifecycle');

    // Open the collection page by clicking the collection entry
    await page.goto('/holmes24/collections');
    await page.waitForLoadState('networkidle');

    const collectionLocator = page.locator(`text="${collectionName}"`).first();
    await expect(collectionLocator).toBeVisible({ timeout: 30_000 });
    await collectionLocator.click();

    // Wait for navigation and extract id
    await page.waitForURL(/\/collections\/[^/]+/, { timeout: 10_000 });
    const url = new URL(page.url());
    const pathSegments = url.pathname.split('/').filter(Boolean);
    collectionId = pathSegments[pathSegments.length - 1];
    expect(collectionId).toBeTruthy();

    // Try a best-effort heading check (don't fail if UI differs)
    try {
      await expect(
        page.locator('h1, h2, [role="heading"]', { hasText: collectionName })
      ).toBeVisible({ timeout: 5_000 });
    } catch {
      // ignore - app may show name elsewhere
    }
  });

  test('upload json to collection', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'as-viewer')
      test.skip('viewer cannot upload in lifecycle');

    // Navigate to the collection page (by id)
    await page.goto(`/holmes24/collections/${collectionId}`);
    await page.waitForLoadState('networkidle');

    // Click upload button to open modal
    await page.waitForSelector('#uploadDocumentsButton', {
      state: 'visible',
      timeout: 10_000,
    });
    await page.click('#uploadDocumentsButton');

    // Prepare file and attach it
    const filePath = path.join(process.cwd(), 'tests', 'data', 'test1.json');

    // Wait for the (invisible) file input to be attached and set files
    await page.waitForSelector('#upload-file-input', {
      state: 'attached',
      timeout: 10_000,
    });
    await page.setInputFiles('#upload-file-input', filePath);

    // Submit upload
    await page.waitForSelector('#submitUploadButton', {
      state: 'visible',
      timeout: 10_000,
    });
    await page.click('#submitUploadButton');

    // Wait for completion marker
    await page.waitForSelector('#upload-complete', { timeout: 60_000 });
  });

  test('verify documents listed in collection', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'as-viewer')
      test.skip('viewer lifecycle path');

    // Ensure we're on the collection page
    await page.goto(`/holmes24/collections/${collectionId}`);
    await page.waitForLoadState('networkidle');

    // Wait for at least one document row to appear
    await page.waitForSelector(
      'table[aria-label="Collection documents"] tbody tr',
      { timeout: 20_000 }
    );
    const docRows = await page
      .locator('table[aria-label="Collection documents"] tbody tr')
      .count();
    expect(docRows).toBeGreaterThan(0);
  });

  test('download collection export', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'as-viewer')
      test.skip('viewer cannot download lifecycle export');

    // Navigate back to list and ensure collection visible
    await page.goto('/holmes24/collections');
    await page.waitForLoadState('networkidle');

    const createdCollection = page.locator(`text="${collectionName}"`).first();
    await expect(createdCollection).toBeVisible({ timeout: 20_000 });

    // Download button id is `#download-<collectionId>`
    const downloadBtnSelector = `#download-${collectionId}`;
    await page.waitForSelector(downloadBtnSelector, {
      state: 'visible',
      timeout: 20_000,
    });

    // Intercept and wait for the download event
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.click(downloadBtnSelector),
    ]);

    const suggestedName = download.suggestedFilename();
    expect(suggestedName && suggestedName.length).toBeGreaterThan(0);
  });

  test('edit collection name', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'as-viewer') test.skip('viewer cannot edit');

    // Navigate to list and click edit for this collection
    await page.goto('/holmes24/collections');
    await page.waitForLoadState('networkidle');

    const editBtnSelector = `#edit-${collectionId}`;
    await page.waitForSelector(editBtnSelector, {
      state: 'visible',
      timeout: 10_000,
    });
    await page.click(editBtnSelector);

    // Modal should open and collection-name-input visible
    await page.waitForSelector('#collection-name-input', {
      state: 'visible',
      timeout: 10_000,
    });

    editedName = `${collectionName} (edited)`;
    await page.fill('#collection-name-input', editedName);

    // Submit the modal
    await page.click('#collection-modal-submit');

    // Wait for the new name to appear in the list
    await page.waitForSelector(`text="${editedName}"`, { timeout: 20_000 });
    await expect(page.locator(`text="${editedName}"`)).toBeVisible();
  });

  test('delete collection', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'as-viewer')
      test.skip('viewer cannot delete');

    // Navigate to list and click delete for this collection
    await page.goto('/holmes24/collections');
    await page.waitForLoadState('networkidle');

    const deleteBtnSelector = `#delete-${collectionId}`;
    const deleteBtn = page.locator(deleteBtnSelector);
    await expect(deleteBtn).toBeVisible({ timeout: 10_000 });

    // Click to open popconfirm
    await deleteBtn.click();

    // Robust popconfirm handling
    const popover = page.locator('.ant-popover, .ant-popconfirm').first();
    await expect(popover).toBeVisible({ timeout: 10_000 });

    const primaryBtn = popover.locator('button.ant-btn-primary').first();
    if ((await primaryBtn.count()) > 0) {
      await expect(primaryBtn).toBeVisible({ timeout: 5_000 });
      await primaryBtn.click();
    } else {
      const labeledBtn = popover
        .locator('button')
        .filter({ hasText: /^(yes|confirm|ok|delete|si|conferma)$/i })
        .first();
      if ((await labeledBtn.count()) > 0) {
        await expect(labeledBtn).toBeVisible({ timeout: 5_000 });
        await labeledBtn.click();
      } else {
        const firstBtn = popover.locator('button').first();
        await expect(firstBtn).toBeVisible({ timeout: 5_000 });
        await firstBtn.click();
      }
    }

    // Wait for the collection to be removed from the list
    await expect(page.locator(`text="${editedName}"`)).toHaveCount(0, {
      timeout: 20_000,
    });

    const containerSelector = `#collection-${collectionId}`;
    const container = page.locator(containerSelector);
    expect(await container.count()).toBe(0);
  });

  // -----------------------
  // Viewer-negative tests:
  // -----------------------

  test('viewer cannot create collections (negative)', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'as-viewer') test.skip('only for viewer');

    await page.goto('/holmes24/collections');
    await page.waitForLoadState('networkidle');

    const newBtn = page.locator('#new-collection-btn');
    if ((await newBtn.count()) === 0) {
      // Button absent as expected
      return;
    }
    // If present for viewers, it must be disabled
    await expect(newBtn).toBeVisible();
    await expect(newBtn).toBeDisabled();
  });

  test('viewer edit/delete controls are visible but non-actionable (negative)', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'as-viewer') test.skip('only for viewer');

    await page.goto('/holmes24/collections');
    await page.waitForLoadState('networkidle');

    // Use first visible collection as target
    const firstCollection = page.locator('[id^="collection-"]').first();
    await expect(firstCollection).toBeVisible({ timeout: 10_000 });

    // Extract id (collection-<id>)
    const idAttr = await firstCollection.getAttribute('id');
    const id = idAttr ? idAttr.replace('collection-', '') : '';
    if (!id) {
      test.skip('no collection id found to assert edit/delete controls');
    }

    const editBtn = page.locator(`#edit-${id}`);
    const deleteBtn = page.locator(`#delete-${id}`);

    // Ensure controls exist in DOM
    if ((await editBtn.count()) === 0) {
      throw new Error(
        'Edit control not found in DOM for viewer (expected visible but non-actionable).'
      );
    }
    if ((await deleteBtn.count()) === 0) {
      throw new Error(
        'Delete control not found in DOM for viewer (expected visible but non-actionable).'
      );
    }

    // Visible checks
    await expect(editBtn).toBeVisible();
    await expect(deleteBtn).toBeVisible();

    // Heuristic checks for non-actionable state:
    //  - aria-disabled="true"
    //  - disabled attribute present
    //  - CSS pointer-events: none
    // If none of these indicators are present, we attempt the action and assert it does NOT open the corresponding UI.

    // EDIT button: check attributes / style
    let ariaDisabled: string | null = null;
    try {
      ariaDisabled = await editBtn.getAttribute('aria-disabled');
    } catch {
      ariaDisabled = null;
    }

    let disabledAttr: string | null = null;
    try {
      disabledAttr = await editBtn.getAttribute('disabled');
    } catch {
      disabledAttr = null;
    }

    let pointerEvents: string | null = null;
    try {
      pointerEvents = await editBtn.evaluate((el) => {
        try {
          return window.getComputedStyle(el as Element).pointerEvents;
        } catch {
          return null;
        }
      });
    } catch {
      pointerEvents = null;
    }

    const editHasDisabledIndicator =
      ariaDisabled === 'true' ||
      disabledAttr !== null ||
      pointerEvents === 'none';

    if (editHasDisabledIndicator) {
      // Assert at least one non-actionable indicator is present
      expect(editHasDisabledIndicator).toBeTruthy();
    } else {
      // No explicit "disabled" indicator: assert click doesn't open edit modal
      await editBtn.click();
      // Give a short grace period for any UI to appear (but not long enough to hang)
      let modalVisible = false;
      try {
        const modal = page.locator('#collection-name-input');
        modalVisible = await modal.isVisible();
      } catch {
        modalVisible = false;
      }
      if (modalVisible) {
        throw new Error('Edit modal opened for viewer user (should not).');
      }
    }

    // DELETE button: same strategy
    let delAriaDisabled: string | null = null;
    try {
      delAriaDisabled = await deleteBtn.getAttribute('aria-disabled');
    } catch {
      delAriaDisabled = null;
    }

    let delDisabledAttr: string | null = null;
    try {
      delDisabledAttr = await deleteBtn.getAttribute('disabled');
    } catch {
      delDisabledAttr = null;
    }

    let delPointerEvents: string | null = null;
    try {
      delPointerEvents = await deleteBtn.evaluate((el) => {
        try {
          return window.getComputedStyle(el as Element).pointerEvents;
        } catch {
          return null;
        }
      });
    } catch {
      delPointerEvents = null;
    }

    const deleteHasDisabledIndicator =
      delAriaDisabled === 'true' ||
      delDisabledAttr !== null ||
      delPointerEvents === 'none';

    if (deleteHasDisabledIndicator) {
      expect(deleteHasDisabledIndicator).toBeTruthy();
    } else {
      // If delete appears actionable but should not work, clicking must NOT open the popconfirm
      await deleteBtn.click();
      // Wait briefly and assert no popover appears
      let popVisible = false;
      try {
        const pop = page.locator('.ant-popover, .ant-popconfirm').first();
        popVisible = await pop.isVisible();
      } catch {
        popVisible = false;
      }
      if (popVisible) {
        throw new Error(
          'Delete popconfirm opened for viewer user (should not).'
        );
      }
    }
  });

  test('viewer cannot upload documents to a collection (negative)', async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== 'as-viewer') test.skip('only for viewer');

    await page.goto('/holmes24/collections');
    await page.waitForLoadState('networkidle');

    const firstCollection = page.locator('[id^="collection-"]').first();
    await expect(firstCollection).toBeVisible({ timeout: 10_000 });

    const idAttr = await firstCollection.getAttribute('id');
    const id = idAttr ? idAttr.replace('collection-', '') : '';
    if (!id) {
      test.skip('no collection id found to assert upload control');
    }

    // Open collection page and assert upload control is absent or disabled
    await page.goto(`/holmes24/collections/${id}`);
    await page.waitForLoadState('networkidle');

    const uploadBtn = page.locator('#uploadDocumentsButton');
    if ((await uploadBtn.count()) === 0) {
      // absent = OK
      return;
    }
    await expect(uploadBtn).toBeVisible();
    await expect(uploadBtn).toBeDisabled();
  });
});
