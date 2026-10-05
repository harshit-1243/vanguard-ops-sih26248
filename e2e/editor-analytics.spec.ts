import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Course-director area: scenario editor (author → validate → save → run) and cross-course analytics. */
const KEY = 'e2e-course-director-key';

async function audit(page: Page, name: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${name}: ${v.id} (${v.impact}) — ${v.nodes.length} node(s): ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
}

async function unlock(page: Page) {
  await page.getByLabel('Course-director key').fill('wrong-key-123');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong key');
  await page.getByLabel('Course-director key').fill(KEY);
  await page.getByRole('button', { name: 'Unlock' }).click();
}

test('author a scenario in the editor, then run an exercise on it', async ({ page }) => {
  const id = `e2e-${Date.now().toString(36)}`;
  await page.goto('/scenarios');
  await unlock(page);
  await expect(page.getByRole('heading', { name: 'Scenario library' })).toBeVisible();
  await audit(page, 'scenario-library');

  await page.getByRole('listitem').filter({ hasText: 'iron-bridge' }).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('tab', { name: 'Map' })).toBeVisible();
  await page.getByLabel('Title').fill('E2E Crossing');
  await page.getByLabel(/Scenario id/).fill(id);

  // Map: paint terrain, add an objective
  await page.getByRole('tab', { name: 'Map' }).click();
  await page.getByRole('button', { name: 'U URBAN', exact: true }).click();
  await page.locator('[data-cell="A8"]').click();
  await expect(page.locator('[data-cell="A8"]')).toHaveAttribute('aria-label', /A8 URBAN/);
  await page.getByRole('button', { name: 'Objective ★' }).click();
  await page.locator('[data-cell="F4"]').click();
  await expect(page.locator('[data-cell="F4"]')).toHaveAttribute('aria-label', /objective/);
  await audit(page, 'editor-map');

  // Forces: add an adaptive enemy unit and give it a route
  await page.getByRole('tab', { name: /Forces/ }).click();
  await page.getByRole('button', { name: 'Enemy unit' }).click();
  await page.getByRole('tab', { name: 'Map' }).click();
  await page.getByRole('button', { name: 'Unit route' }).click();
  await page.getByLabel('Unit', { exact: true }).selectOption({ label: '🔴 HOSTILE 13' });
  await page.locator('[data-cell="G7"]').click();
  await expect(page.getByLabel('Waypoint 1 time (s)')).toHaveValue('300');

  // MSEL: add a scripted jammer
  await page.getByRole('tab', { name: /MSEL/ }).click();
  await page.getByRole('button', { name: 'JAMMER', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'MSEL (16)' })).toBeVisible();
  await audit(page, 'editor-msel');

  await page.getByRole('button', { name: 'Validate + dry run' }).click();
  await expect(page.getByText('Valid — ready to save')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/T\+30:00 in \d+ ms/)).toBeVisible();
  await page.getByRole('button', { name: 'Save new' }).click();
  await expect(page).toHaveURL(new RegExp(`/scenarios/edit/${id}$`));

  // Invalid edit is refused with a path-specific error
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByLabel('Title').fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/title/).first()).toBeVisible();
  await page.getByLabel('Title').fill('E2E Crossing');

  // Run it
  await page.goto('/create');
  await page.getByRole('button', { name: /E2E Crossing/ }).click();
  await page.getByLabel(/Course \/ syndicate/).fill('E2E Course');
  await page.getByRole('button', { name: 'Create exercise' }).click();
  await expect(page.getByTestId('session-code')).toHaveText(/^[A-Z0-9]{6}$/);
});

test('cross-course analytics aggregates finished exercises', async ({ page, request }) => {
  await request.post('/api/demo', { data: {} });
  await page.goto('/analytics');
  await unlock(page);
  await expect(page.getByRole('heading', { name: 'Cross-course analytics' })).toBeVisible();
  await expect(page.getByText('Replaying finished exercises…')).toBeHidden({ timeout: 30_000 });
  await page.getByLabel('Course', { exact: true }).selectOption('Demo');
  await expect(page.getByRole('row', { name: /ARJUN/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By role' })).toBeVisible();
  await expect(page.getByText(/Advance into force ratio|Relay that does not help|Air strike/).first()).toBeVisible();
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV' }).click();
  expect((await csv).suggestedFilename()).toBe('vanguard-analytics.csv');
  await audit(page, 'analytics');
});
