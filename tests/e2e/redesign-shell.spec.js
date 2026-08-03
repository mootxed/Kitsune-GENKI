import { test, expect } from '@playwright/test';
import { seedAppState, navigateToScreen } from './helpers/reset-app-state.js';

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 600, height: 960 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function expectNoHorizontalOverflow(page, screenSelector) {
  const overflow = await page.evaluate((selector) => {
    const root = document.documentElement;
    const screen = document.querySelector(selector);
    return {
      root: root.scrollWidth > root.clientWidth,
      screen: screen ? screen.scrollWidth > screen.clientWidth : true,
    };
  }, screenSelector);
  expect(overflow).toEqual({ root: false, screen: false });
}

test.describe('KotoKitsu redesign shell', () => {
  for (const viewport of VIEWPORTS) {
    test(`keeps the real Home shell responsive at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedAppState(page, {
        version: 15,
        onboarding: { completed: true, schemaVersion: 1 },
        history: {},
        chapters: {},
        srs: {},
        settings: { darkMode: 'light' },
      });
      await navigateToScreen(page, 'home');

      const redesignToken = await page.evaluate(() =>
        window.getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim()
      );
      expect(redesignToken).toBe('246px');
      await expect(page.locator('.home-hero')).toBeVisible();
      await expect(page.locator('.home-mascot img')).toHaveJSProperty('complete', true);
      await expect(page.locator('#pomodoro-floating-btn')).toBeVisible();
      await expectNoHorizontalOverflow(page, '#screen-home');

      const chrome = await page.evaluate(() => {
        const nav = document.querySelector('.tabbar');
        const visibleTabs = [...document.querySelectorAll('.tab')].filter(
          (tab) => window.getComputedStyle(tab).display !== 'none'
        );
        const widget = document.querySelector('#pomodoro-floating-btn');
        const hero = document.querySelector('.home-hero');
        const navRect = nav.getBoundingClientRect();
        const widgetRect = widget.getBoundingClientRect();
        return {
          navPosition: window.getComputedStyle(nav).position,
          navRect: { top: navRect.top, right: navRect.right, bottom: navRect.bottom },
          widgetRect: { top: widgetRect.top, right: widgetRect.right, bottom: widgetRect.bottom },
          visibleTabs: visibleTabs.length,
          heroHeight: hero.getBoundingClientRect().height,
        };
      });

      expect(chrome.navPosition).toBe('fixed');
      if (viewport.width < 900) {
        expect(chrome.visibleTabs).toBe(5);
        expect(chrome.widgetRect.bottom).toBeLessThanOrEqual(chrome.navRect.top);
        if (viewport.width <= 430) expect(chrome.heroHeight).toBeGreaterThan(360);
      } else {
        expect(chrome.visibleTabs).toBe(9);
        expect(chrome.navRect.top).toBe(0);
        expect(chrome.navRect.bottom).toBe(viewport.height);
      }

      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await expectNoHorizontalOverflow(page, '#screen-home');
      const theme = await page.evaluate(() => {
        const styles = window.getComputedStyle(document.body);
        return { background: styles.backgroundColor, color: styles.color };
      });
      expect(theme.background).not.toBe(theme.color);
    });
  }

  test('keeps Plan and SRS controls usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedAppState(page, {
      version: 15,
      onboarding: { completed: true, schemaVersion: 1 },
      history: {},
      chapters: {},
      srs: {},
      settings: { darkMode: 'light' },
    });

    await navigateToScreen(page, 'plan');
    await expectNoHorizontalOverflow(page, '#screen-plan');

    await navigateToScreen(page, 'srs');
    await expectNoHorizontalOverflow(page, '#screen-srs');
    const srsTabs = page.locator('#srs-tabs-container .lib-tab');
    await expect(srsTabs).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(srsTabs.nth(index)).toBeVisible();
    }

    const tabLayout = await page.locator('#srs-tabs-container').evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return { display: styles.display, columns: styles.gridTemplateColumns };
    });
    expect(tabLayout.display).toBe('grid');
    expect(tabLayout.columns.split(' ')).toHaveLength(2);
  });
});
