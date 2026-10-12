import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { createMatchStore } from '../net/storage/matchStore.js';
import { createHttpServer } from '../net/http.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const store = createMatchStore();
const backend = createHttpServer({ matchStore: store });
let frontend, browser;
try {
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  frontend = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0,
    proxy: { '/api': `http://127.0.0.1:${backend.address().port}` } } });
  await frontend.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${frontend.httpServer.address().port}`);
  await page.getByRole('button', { name: 'Xem replay', exact: true }).click();
  await page.getByRole('button', { name: /Hoàng Định.*vs.*Huy Khánh/ }).first().waitFor();
  await page.getByLabel('Chọn đội của bạn').selectOption('[Ví dụ] Hoàng Định');
  const rows = page.locator('.replay-match-row');
  await page.getByRole('button', { name: /Hoàng Định.*vs.*LTM 5/ }).waitFor();
  assert.equal(await rows.count(), 3);
  for (const text of ['[Ví dụ] Hoàng Định thắng', '[Ví dụ] LTM 5 thắng', 'Hòa']) {
    await page.locator('.replay-result').filter({ hasText: text }).waitFor();
  }
  const times = await rows.locator('time').evaluateAll(elements => elements.map(element => element.dateTime));
  assert.ok(times.every(value => !Number.isNaN(Date.parse(value))));
  mkdirSync(resolve('data/verification'), { recursive: true });
  await page.screenshot({ path: resolve('data/verification/saved-replay-list.png'), fullPage: true });
  for (const result of ['[Ví dụ] Hoàng Định thắng', '[Ví dụ] LTM 5 thắng', 'Hòa']) {
    await rows.filter({ has: page.locator('.replay-result').filter({ hasText: result }) }).click();
    await page.getByTitle('Về cuối', { exact: true }).click();
    await page.locator('.banner.win').waitFor();
    assert.ok((await page.locator('.banner.win').innerText()).includes(result));
    await page.screenshot({ path: resolve(`data/verification/saved-replay-${result === 'Hòa' ? 'draw' : result.includes('LTM') ? 'loss' : 'win'}.png`), fullPage: true });
    await page.getByRole('button', { name: '← Danh sách trận', exact: true }).click();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Xem replay', exact: true }).click();
  await page.getByRole('button', { name: /Hoàng Định.*vs.*LTM 5/ }).waitFor();
  assert.deepEqual(errors, []);
  assert.ok(store.getRankings().filter(team => team.name.startsWith('[Ví dụ]')).every(team => team.played === 0 && team.points === 0));
  console.log('PASS: all 3 saved examples show opponents, timestamps and results; each opens and plays to the correct outcome; reload preserves records; examples add no ranking points.');
} finally {
  await browser?.close(); await frontend?.close();
  await new Promise(resolve => backend.close(resolve)); store.close();
}
