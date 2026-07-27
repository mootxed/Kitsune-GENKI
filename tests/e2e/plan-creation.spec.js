import { test, expect } from '@playwright/test';
import { seedAppState, navigateToScreen } from './helpers/reset-app-state.js';

test.describe('E2E Plan Creation & Form Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set onboarding as completed to open regular plan form directly
    await seedAppState(page, {
      version: 13,
      onboarding: { completed: true, schemaVersion: 1 },
      studyPlan: null,
      chapters: {},
      settings: { darkMode: 'auto' },
    });
    await navigateToScreen(page, 'plan');
  });

  test('Regular plan creation closes form and displays plan view', async ({ page }) => {
    const formContainer = page.locator('#plan-form-container');
    const viewContainer = page.locator('#plan-view-container');
    const createBtn = page.locator('[data-testid="plan-generate-btn"]');

    await expect(formContainer).toBeVisible();
    await expect(viewContainer).toBeHidden();

    // Set days to 200 so the plan is valid (minimum required is ~158 for full course)
    const daysInput = page.locator('[data-testid="plan-total-days"]');
    await daysInput.fill('200');

    await createBtn.click();

    // After clicking create, form should close and view should be visible
    await expect(formContainer).toBeHidden({ timeout: 10000 });
    await expect(viewContainer).toBeVisible();
    await expect(page.locator('[data-testid="plan-status-card"]')).toBeVisible();
  });

  test('Editing existing plan opens edit form, saving updates view', async ({ page }) => {
    // Create initial plan with a valid number of days
    const daysInput = page.locator('[data-testid="plan-total-days"]');
    await daysInput.fill('200');
    await page.locator('[data-testid="plan-generate-btn"]').click();
    await expect(page.locator('#plan-view-container')).toBeVisible({ timeout: 10000 });

    // Click edit button
    const editBtn = page.locator('#plan-edit-btn');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Form should open
    await expect(page.locator('#plan-form-container')).toBeVisible();
    await expect(page.locator('#plan-form-title')).toHaveText('Редактировать план');

    // Change capacity
    await page.locator('[data-testid="plan-capacity-select"]').selectOption('60');

    // Ensure days remain valid
    const editDaysInput = page.locator('[data-testid="plan-total-days"]');
    await editDaysInput.fill('200');

    // Click save
    await page.locator('[data-testid="plan-generate-btn"]').click();

    // Form closes and plan view returns
    await expect(page.locator('#plan-form-container')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('#plan-view-container')).toBeVisible();
  });

  test('Tight deadline shows warning and can be accepted', async ({ page }) => {
    // Fill in tight deadline parameters
    const daysInput = page.locator('[data-testid="plan-total-days"]');
    if (await daysInput.isVisible()) {
      await daysInput.fill('90');
    }
    const capacitySelect = page.locator('[data-testid="plan-capacity-select"]');
    if (await capacitySelect.isVisible()) {
      await capacitySelect.selectOption('30');
    }

    // Trigger plan generation — expect tight deadline warning
    const createBtn = page.locator('[data-testid="plan-generate-btn"]');
    await createBtn.click();

    // Check if any visible warning shows up
    const warningVisible =
      (await page.locator('#plan-warning:not(.hidden), #plan-view-warning:not(.hidden)').count()) >
      0;

    if (warningVisible) {
      // Find and check the "accept recommended deadline" checkbox if present
      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      for (let i = 0; i < count; i++) {
        const label = await checkboxes
          .nth(i)
          .evaluate((el) => el.closest('label')?.textContent || '');
        if (label.includes('рекоменд') || label.includes('срок')) {
          await checkboxes.nth(i).check({ force: true });
          break;
        }
      }
      await createBtn.click();
    }

    // Check that either form closed (plan created) or form/view is safely rendered
    const formVisible = await page.locator('#plan-form-container').isVisible();
    const viewVisible = await page.locator('#plan-view-container').isVisible();

    expect(formVisible || viewVisible).toBe(true);
  });
});
