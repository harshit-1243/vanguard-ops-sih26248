import { clickCell } from './map';
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * README screenshots from a real multi-context session. Opt-in:
 *   SCREENSHOTS=1 pnpm e2e e2e/screenshots.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to capture docs/screenshots');

const OUT = 'docs/screenshots';
const shot = (p: Page, name: string) => p.screenshot({ path: `${OUT}/${name}.png` });

async function page(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })).newPage();
}

async function join(browser: Browser, code: string, role: string, cs: string) {
  const p = await page(browser);
  await p.goto(`/join?code=${code}`);
  await p.getByTestId(`role-${role}`).check();
  await p.getByLabel('Your callsign').fill(cs);
  await p.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(p.getByText('WAITING FOR THE DS TO START')).toBeVisible();
  return p;
}

test('capture README screenshots', async ({ browser, request }) => {
  const landing = await page(browser);
  await landing.goto('/');
  await shot(landing, '01-landing');

  const ds = await page(browser);
  await ds.goto('/create');
  await ds.getByRole('button', { name: /Iron Bridge/ }).click();
  await shot(ds, '02-create');
  await ds.getByRole('button', { name: 'Create exercise' }).click();
  const code = (await ds.getByTestId('session-code').innerText()).trim();
  await ds.getByRole('button', { name: 'Open DS console' }).click();

  const cdr = await join(browser, code, 'CDR', 'ARJUN');
  const alo = await join(browser, code, 'ALO', 'ZARA');
  const plB = await join(browser, code, 'PL_B', 'KABIR');
  await shot(plB, '03-trainee-lobby');

  await ds.getByRole('button', { name: 'Start exercise' }).click();
  await ds.getByRole('button', { name: '×4' }).click();
  // let sensors report for ~2 sim minutes
  await expect.poll(async () => (await cdr.getByLabel(/Exercise time/).innerText()), { timeout: 60_000 }).toMatch(/T\+0[2-9]:/);
  await ds.getByRole('button', { name: 'Pause' }).click();
  await shot(cdr, '04-trainee-cdr-intel');
  await cdr.getByRole('tab', { name: /Comms/ }).click();
  await shot(cdr, '05-trainee-cdr-comms-pace');

  await ds.getByRole('button', { name: 'place jammer' }).click();
  await clickCell(ds, 'G2');
  await ds.getByRole('button', { name: 'Activate jammer' }).click();
  await ds.getByRole('button', { name: 'Resume' }).click();
  await expect(plB.getByText('CUT OFF — ACT ON INTENT.')).toBeVisible();
  await ds.getByRole('button', { name: 'Pause' }).click();
  await plB.getByRole('tab', { name: /Decide/ }).click();
  await clickCell(plB, 'F4');
  await plB.getByLabel('Rationale (required, ≥ 15 characters)').fill('Cut off from KESTREL 6 — acting on intent: close on the bridge from the east.');
  await shot(plB, '06-trainee-cut-off-decision');
  await plB.getByRole('button', { name: 'Yes', exact: true }).click();
  await plB.getByRole('button', { name: 'Commit decision' }).click();
  await expect(plB.getByText(/Decision logged/)).toBeVisible();

  await ds.getByRole('tab', { name: /Injects/ }).click();
  await shot(ds, '07-ds-god-view-injects');
  await ds.getByRole('tab', { name: /Decisions/ }).click();
  await ds.getByRole('list', { name: 'Decisions (newest first)' }).getByRole('button').first().click();
  await shot(ds, '08-ds-decision-feed');
  await ds.getByRole('button', { name: 'PL_B ✕' }).click();
  await expect(ds.getByText('Showing exactly what PL_B sees right now')).toBeVisible();
  await shot(ds, '09-ds-view-as-pl-b');
  await ds.getByRole('button', { name: 'Ground truth' }).click();
  await ds.getByRole('button', { name: '3D · VR' }).click();
  await expect(ds.getByTestId('sand-table')).toBeVisible();
  await ds.waitForTimeout(1500);
  await shot(ds, '15-ds-3d-sand-table');
  await ds.getByRole('button', { name: 'Map', exact: true }).click();
  await cdr.getByRole('button', { name: '3D · VR' }).click();
  await cdr.waitForTimeout(1500);
  await shot(cdr, '16-trainee-3d-sand-table');

  await ds.getByRole('button', { name: 'Resume' }).click();
  await ds.getByRole('button', { name: 'Freeze & probe' }).click();
  await expect(alo.getByText('SITUATION FREEZE — SA PROBE')).toBeVisible();
  await shot(alo, '10-sagat-probe');

  // Finished demo exercise for the AAR shots
  const demo = await (await request.post('/api/demo', { data: {} })).json();
  const aar = await page(browser);
  await aar.goto('/');
  await aar.evaluate(([c, t]) => sessionStorage.setItem(`vanguard:${c}`, JSON.stringify({ token: t, actor: 'DS' })), [demo.code, demo.instructorToken]);
  await aar.goto(`/aar/${demo.code}`);
  await expect(aar.getByRole('heading', { name: 'Executive summary' })).toBeVisible();
  await shot(aar, '11-aar-summary');
  await aar.locator('#q2').scrollIntoViewIfNeeded();
  await aar.evaluate(() => document.getElementById('q2')!.scrollIntoView());
  await shot(aar, '12-aar-timeline');
  await aar.evaluate(() => document.querySelector('[aria-label="Comms network graph"]')!.scrollIntoView({ block: 'center' }));
  await shot(aar, '13-aar-metrics-network');
  const card = aar.getByTestId('decision-cards').locator('article').nth(2);
  await card.getByRole('button', { name: 'Reveal ground truth' }).click();
  await card.scrollIntoViewIfNeeded();
  await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shot(aar, '14-aar-decision-card');
  // Course director: scenario editor + cross-course analytics
  const cd = await page(browser);
  await cd.goto('/');
  await cd.evaluate(() => sessionStorage.setItem('vg-admin-key', 'e2e-course-director-key'));
  await cd.goto('/scenarios/new?from=iron-bridge');
  await cd.getByRole('tab', { name: 'Map' }).click();
  await cd.getByRole('button', { name: 'Unit route' }).click();
  await cd.getByLabel('Unit', { exact: true }).selectOption({ index: 7 });
  await cd.getByRole('button', { name: 'Validate + dry run' }).click();
  await expect(cd.getByText('Valid — ready to save')).toBeVisible({ timeout: 20_000 });
  await shot(cd, '17-scenario-editor');
  await request.post('/api/demo', { data: {} });
  await cd.goto('/analytics');
  await expect(cd.getByRole('heading', { name: 'By role' })).toBeVisible({ timeout: 30_000 });
  await shot(cd, '18-cross-course-analytics');
});
