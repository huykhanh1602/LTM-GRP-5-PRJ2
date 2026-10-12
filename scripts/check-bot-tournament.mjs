import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const expected = JSON.parse(readFileSync('data/verification/bot-tournament.json', 'utf8'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/');
  await page.getByRole('button', { name: 'Bảng xếp hạng', exact: true }).click();
  await page.getByRole('cell', { name: 'bot2', exact: true }).waitFor();
  for (const team of expected.rankings) {
    const row = page.locator('tbody tr').filter({ has: page.getByRole('cell', { name: team.name, exact: true }) });
    const cells = await row.locator('td').allTextContents();
    assert.equal(Number(cells[0]), team.rank);
    assert.equal(Number(cells[2]), team.played);
    assert.equal(Number(cells[3]), team.wins);
    assert.equal(Number(cells[5]), team.losses);
    assert.equal(Number(cells[6]), team.points);
  }
  await page.screenshot({ path: 'data/verification/bot-rankings.png', fullPage: true });
  await page.getByRole('button', { name: 'Xem replay', exact: true }).click();
  await page.getByLabel('Chọn đội của bạn').selectOption('bot1');
  await page.getByText('4 trận', { exact: true }).waitFor();
  assert.equal(await page.locator('.replay-match-row').count(), 4);
  await page.screenshot({ path: 'data/verification/bot1-replays.png', fullPage: true });
  await page.locator('.replay-match-row').first().click();
  await page.getByTitle('Về cuối', { exact: true }).click();
  await page.locator('.banner.win').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: live web rankings match SQLite results for bot1/bot2/bot3; bot1 history contains 4 games; replay opens and reaches the recorded result.');
} finally { await browser.close(); }
