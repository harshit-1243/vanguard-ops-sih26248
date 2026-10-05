import type { Page } from '@playwright/test';

/** Real mouse click on a map sector — works for the MapLibre map and the SVG fallback. */
export async function clickCell(page: Page, cell: string): Promise<void> {
  const svgCell = page.locator(`[data-cell="${cell}"]`);
  if ((await svgCell.count()) > 0) return svgCell.first().click();
  const map = page.locator('.vg-map').first();
  await map.waitFor();
  await page.waitForFunction(() => !!document.querySelector('.vg-map .maplibregl-canvas'));
  await page.waitForTimeout(300); // let fitBounds settle
  const pt = await map.evaluate((el, c) => (el as HTMLElement & { __vgCellPoint: (c: string) => { x: number; y: number } }).__vgCellPoint(c), cell);
  await page.mouse.click(pt.x, pt.y);
}
