import { expect, type Page } from '@playwright/test';

/** Follow the visitor's disclosure before using a secondary room tool. */
export async function openRoomSettings(page: Page) {
  const button = page.locator('#room-settings');
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  await expect(page.locator('#room-settings-menu')).toBeVisible();
}
