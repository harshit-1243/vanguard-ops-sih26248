import { readFileSync } from 'node:fs';
import { clickCell } from './map';
import { expect, test, type Browser, type Page } from '@playwright/test';
// @ts-expect-error — no types for the deep import (the package index runs a self-test)
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

/**
 * PRD §14 E2E: instructor + 3 trainees in separate browser contexts (separate cookie/storage jars,
 * i.e. separate "machines" as far as the app is concerned — the only sync is Socket.IO).
 * Iron Bridge for ~3 simulated minutes at ×4: jammer → trainee cut off → decision → SAGAT probe →
 * end → AAR → PDF with decision cards.
 */

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

function simSeconds(text: string): number {
  const m = /T\+(\d+):(\d{2})/.exec(text);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

async function joinAs(browser: Browser, code: string, role: 'CDR' | 'PL_A' | 'PL_B', callsign: string) {
  const page = await newPage(browser);
  await page.goto(`/join?code=${code}`);
  await page.getByTestId(`role-${role}`).check();
  await page.getByLabel('Your callsign').fill(callsign);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/play/${code}$`));
  await expect(page.getByText('WAITING FOR THE DS TO START')).toBeVisible();
  return page;
}

test('Iron Bridge: DS + 3 trainees, jammer cut-off, decision, probe, AAR PDF', async ({ browser }) => {
  // ---- DS creates the exercise
  const ds = await newPage(browser);
  await ds.goto('/create');
  await ds.getByRole('button', { name: /Iron Bridge/ }).click();
  await ds.getByRole('button', { name: 'Create exercise' }).click();
  const code = (await ds.getByTestId('session-code').innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await ds.getByRole('button', { name: 'Open DS console' }).click();
  await expect(ds.getByText('LOBBY — SHARE THE SESSION CODE')).toBeVisible();

  // ---- three trainees join from separate contexts
  const cdr = await joinAs(browser, code, 'CDR', 'ARJUN');
  const plA = await joinAs(browser, code, 'PL_A', 'MEERA');
  const plB = await joinAs(browser, code, 'PL_B', 'KABIR');
  await expect(ds.getByText('KABIR · online')).toBeVisible();

  // ---- start at ×4
  await ds.getByRole('button', { name: 'Start exercise' }).click();
  await ds.getByRole('button', { name: '×4' }).click();
  for (const p of [cdr, plA, plB]) await expect(p.getByText('RUNNING ×4')).toBeVisible();

  // ---- CDR transmits to PL A over the command net (real cross-context traffic)
  await cdr.getByRole('tab', { name: /Comms/ }).click();
  await cdr.getByRole('checkbox', { name: 'KESTREL 1' }).check();
  await cdr.getByLabel('Message text').fill('KESTREL 1, advance to C4 and report.');
  await cdr.getByRole('button', { name: 'Send message' }).click();
  await plA.getByRole('tab', { name: /Comms/ }).click();
  // It may arrive partly garbled (corruption is part of the pipeline) — check the RX from KESTREL 6.
  const plALog = plA.getByRole('list', { name: 'Message log' });
  await expect(plALog.getByText('KESTREL 6')).toBeVisible({ timeout: 30_000 });
  await expect(plALog.getByText(/advance|~~~/).first()).toBeVisible();

  // ---- DS places a jammer over PL B (G2, VHF+HF) using the map tool
  await ds.getByRole('button', { name: 'place jammer' }).click();
  await clickCell(ds, 'G2');
  await ds.getByRole('button', { name: 'Activate jammer' }).click();
  await expect(ds.getByRole('button', { name: 'PL_B ✕' })).toBeVisible();

  // ---- PL B is cut off and decides under mission command
  await expect(plB.getByText('CUT OFF — ACT ON INTENT.')).toBeVisible();
  await plB.getByRole('tab', { name: /Decide/ }).click();
  await plB.getByRole('button', { name: 'Advance', exact: true }).click();
  await clickCell(plB, 'F4');
  await expect(plB.getByLabel('Target sector')).toHaveValue('F4');
  await plB.getByLabel('Rationale (required, ≥ 15 characters)').fill('Cut off from KESTREL 6; intent is to seize the bridge, so I close on F4.');
  await plB.getByRole('button', { name: 'Yes', exact: true }).click();
  await plB.getByRole('button', { name: 'Commit decision' }).click();
  await expect(plB.getByText(/Decision logged at T\+/)).toBeVisible();

  // DS sees it in the live feed with a ground-truth badge
  await ds.getByRole('tab', { name: /Decisions/ }).click();
  await expect(ds.getByRole('list', { name: 'Decisions (newest first)' }).getByText('KESTREL 2')).toBeVisible();
  await expect(ds.getByRole('list', { name: 'Decisions (newest first)' }).getByText('cut off', { exact: true })).toBeVisible();

  // ---- let ~3 minutes of sim time pass (×4 ⇒ ~45 s wall)
  await expect
    .poll(async () => simSeconds(await ds.getByLabel(/Exercise time/).innerText()), { timeout: 120_000, intervals: [2_000] })
    .toBeGreaterThanOrEqual(180);

  // ---- SAGAT freeze: every trainee answers, DS scores and resumes
  await ds.getByRole('button', { name: 'Freeze & probe' }).click();
  for (const p of [cdr, plA, plB]) {
    await expect(p.getByText('SITUATION FREEZE — SA PROBE')).toBeVisible();
    await p.getByRole('button', { name: 'Lock answers' }).click();
    await expect(p.getByText(/Answers locked. Waiting for the DS/)).toBeVisible();
  }
  await ds.getByRole('button', { name: 'Score & resume' }).click();
  await expect(cdr.getByText('SITUATION FREEZE — SA PROBE')).toBeHidden();

  // ---- end and open the AAR
  await ds.getByRole('button', { name: 'End', exact: true }).click();
  await ds.getByRole('dialog').getByRole('button', { name: 'End exercise' }).click();
  await expect(plB.getByText('Exercise ended — the after-action review is available.')).toBeVisible();
  await ds.getByRole('link', { name: 'Open AAR' }).click();
  await expect(ds.getByRole('heading', { name: 'Executive summary' })).toBeVisible();
  const cards = ds.getByTestId('decision-cards').locator('article');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first().getByText('At decision time — knowable')).toBeVisible();
  // hindsight-safe: truth hidden until revealed
  await expect(cards.first().getByText('Ground truth — revealed')).toBeHidden();
  await cards.first().getByRole('button', { name: 'Reveal ground truth' }).click();
  await expect(cards.first().getByText('Ground truth — revealed')).toBeVisible();

  // ---- PDF export downloads and contains decision cards
  const [download] = await Promise.all([ds.waitForEvent('download'), ds.getByTestId('export-pdf').click()]);
  expect(download.suggestedFilename()).toMatch(/^vanguard-aar-iron-bridge-.*\.pdf$/);
  const path = await download.path();
  const pdf = await pdfParse(readFileSync(path!));
  expect(pdf.text).toContain('AT DECISION TIME (KNOWABLE)');
  expect(pdf.text).toContain('GROUND TRUTH (REVEALED)');
  expect(pdf.text).toMatch(/Decision D\d+ · T\+\d\d:\d\d · KESTREL 2 \(PL_B\) · ADVANCE F4 · CUT OFF/);
  expect(pdf.text).toContain('Training simulation');

  // trainees can open the AAR after the end
  await plB.getByRole('link', { name: 'Open AAR' }).click();
  await expect(plB.getByRole('heading', { name: 'Executive summary' })).toBeVisible();
});
