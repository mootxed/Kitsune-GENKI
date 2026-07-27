import { test, expect } from '@playwright/test';

test.describe('E2E Plan Creation & Form Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      if (window.indexedDB) window.indexedDB.deleteDatabase('KitsuneGenkiDB');
      // Set onboarding as completed to open regular plan form directly
      localStorage.setItem(
        'kitsune_state_v1',
        JSON.stringify({
          version: 13,
          onboarding: { completed: true, schemaVersion: 1 },
          studyPlan: null,
          chapters: {},
          settings: { darkMode: 'auto' },
        })
      );
    });
    await page.reload();
  });

  test('Regular plan creation closes form and displays plan view', async ({ page }) => {
    await page.goto('/#plan');

    const formContainer = page.locator('#plan-form-container');
    const viewContainer = page.locator('#plan-view-container');
    const createBtn = page.locator('[data-testid="plan-generate-btn"]');

    await expect(formContainer).toBeVisible();
    await expect(viewContainer).toBeHidden();

    await createBtn.click();

    // After clicking create, form should close and view should be visible
    await expect(formContainer).toBeHidden();
    await expect(viewContainer).toBeVisible();
    await expect(page.locator('[data-testid="plan-status-card"]')).toBeVisible();
  });

  test('Editing existing plan opens edit form, saving updates view', async ({ page }) => {
    await page.goto('/#plan');

    // Create initial plan
    await page.locator('[data-testid="plan-generate-btn"]').click();
    await expect(page.locator('#plan-view-container')).toBeVisible();

    // Click edit button
    const editBtn = page.locator('#plan-edit-btn');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Form should open
    await expect(page.locator('#plan-form-container')).toBeVisible();
    await expect(page.locator('#plan-form-title')).toHaveText('Редактировать план');

    // Change capacity
    await page.locator('[data-testid="plan-capacity-select"]').selectOption('60');

    // Click save
    await page.locator('[data-testid="plan-generate-btn"]').click();

    // Form closes and plan view returns
    await expect(page.locator('#plan-form-container')).toBeHidden();
    await expect(page.locator('#plan-view-container')).toBeVisible();
  });

  test('Tight deadline requires confirming realistic deadline checkbox', async ({ page }) => {
    await page.goto('/#plan');

    // Set 12 total days (tight for full course)
    await page.locator('[data-testid="plan-total-days"]').fill('12');
    await page.locator('[data-testid="plan-capacity-select"]').selectOption('15');

    // Trigger live preview / warning
    const createBtn = page.locator('[data-testid="plan-generate-btn"]');
    await createBtn.click();

    // Warning should show up
    const warning = page.locator('#plan-warning');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('слишком короткий');

    // Check the accept deadline checkbox
    const acceptCheckbox = page.locator('[data-testid="plan-accept-deadline"]');
    await expect(acceptCheckbox).toBeVisible();
    await acceptCheckbox.check();

    // Click create again
    await createBtn.click();

    // Form should succeed and close
    await expect(page.locator('#plan-form-container')).toBeHidden();
    await expect(page.locator('#plan-view-container')).toBeVisible();
  });
});
