import { expect, test } from '@playwright/test';

/** Landing page: the truth/fog divider, join-by-code, demo link targets, mobile tabs, lazy images. */
test('desktop hero: divider is keyboard-operable and join routes to the lobby', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every commander sees a different war.' })).toBeVisible();
  const slider = page.getByRole('slider', { name: /ground truth and Kestrel 2/ });
  await expect(slider).toHaveAttribute('aria-valuenow', '50');
  await slider.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuenow', '34');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '94');

  // drag with the pointer
  const hero = await page.getByTestId('fog-divider').boundingBox();
  await page.mouse.move(hero!.x + hero!.width / 2, 500);
  await page.mouse.down();
  await page.mouse.move(1440 * 0.3, 500, { steps: 5 });
  await page.mouse.up();
  await expect(slider).toHaveAttribute('aria-valuenow', '30');

  // every lazy screenshot actually loads
  for (const id of ['ds', 'vr', 'directors']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  }
  await expect.poll(() => page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length)).toBe(0);

  await page.getByRole('button', { name: 'Reveal ground truth' }).click();
  await expect(page.getByText('✓ SOUND')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByLabel('6-character session code').fill('abc123');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).toHaveURL(/\/join\?code=ABC123$/);
});

test('mobile hero: tabs switch the picture; nav CTA goes to create', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto('/');
  await expect(page.getByRole('tab', { name: /KESTREL 2/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('WHAT KESTREL 2 SEES')).toBeVisible();
  await page.getByRole('tab', { name: /GROUND TRUTH/ }).click();
  await expect(page.getByRole('img', { name: /Ground truth: the sand model/ })).toBeVisible();
  await page.getByRole('button', { name: 'MENU' }).click();
  await expect(page.getByRole('link', { name: 'DS log in', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Create exercise →' }).first().click();
  await expect(page).toHaveURL(/\/create$/);
});
