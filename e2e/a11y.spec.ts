import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Accessibility pass (PRD US-NF-3): no serious/critical axe violations on the main screens. */
async function audit(page: Page, name: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${name}: ${v.id} (${v.impact}) — ${v.nodes.length} node(s): ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

test('landing, create, join, trainee console, DS console and AAR are accessible', async ({ browser, request }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await audit(page, 'landing');
  await page.goto('/create');
  await page.getByRole('button', { name: /Iron Bridge/ }).click();
  await audit(page, 'create');

  // A finished demo exercise gives every screen real content.
  const demo = await (await request.post('/api/demo', { data: {} })).json();
  const live = await (await request.post('/api/sessions', { data: { scenarioId: 'iron-bridge' } })).json();
  await page.goto(`/join?code=${live.code}`);
  await expect(page.getByTestId('role-PL_A')).toBeVisible();
  await audit(page, 'join');
  await page.getByTestId('role-PL_A').check();
  await page.getByLabel('Your callsign').fill('AUDIT');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('WAITING FOR THE DS TO START')).toBeVisible();
  await audit(page, 'trainee-lobby');

  const ds = await (await browser.newContext()).newPage();
  await ds.goto('/');
  await ds.evaluate(([code, token]) => sessionStorage.setItem(`vanguard:${code}`, JSON.stringify({ token, actor: 'DS' })), [live.code, live.instructorToken]);
  await ds.goto(`/ds/${live.code}`);
  await ds.getByRole('button', { name: 'Start exercise' }).click();
  await expect(page.getByRole('tab', { name: /Intel/ })).toBeVisible();
  await audit(page, 'trainee-console');
  await audit(ds, 'ds-console');

  await ds.evaluate(([code, token]) => sessionStorage.setItem(`vanguard:${code}`, JSON.stringify({ token, actor: 'DS' })), [demo.code, demo.instructorToken]);
  await ds.goto(`/aar/${demo.code}`);
  await expect(ds.getByRole('heading', { name: 'Executive summary' })).toBeVisible();
  await audit(ds, 'aar');
});
