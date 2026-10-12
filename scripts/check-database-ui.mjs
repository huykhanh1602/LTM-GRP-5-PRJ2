// Optional browser check: install Playwright or set PLAYWRIGHT_MODULE to its module path.
// Uses its own temporary SQLite database and ports; never touches data/game.sqlite.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { createMatchStore } from '../net/storage/matchStore.js';
import { createHttpServer } from '../net/http.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir = mkdtempSync(join(tmpdir(), 'ltm-ui-check-'));
const store = createMatchStore({ filename: join(dir, 'game.sqlite') });
const backend = createHttpServer({ matchStore: store });
let frontend, browser;
try {
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  frontend = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0,
    proxy: { '/api': `http://127.0.0.1:${backend.address().port}` } } });
  await frontend.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${frontend.httpServer.address().port}`);
  await page.getByRole('button', { name: 'Bảng xếp hạng', exact: true }).click();
  await page.getByText('Chưa có đội nào trong database.').waitFor();

  const sample = JSON.parse(readFileSync(new URL('../replay.json', import.meta.url), 'utf8'));
  for (let i = 1; i <= 12; i++) {
    const replay = structuredClone(sample);
    replay.match_info.match_id = `CHECK_${String(i).padStart(2, '0')}`;
    store.importReplay(replay, { teamAId: 'alpha', teamBId: 'beta' });
  }
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
  await page.getByRole('cell', { name: '36', exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 2);
  assert.match(await page.locator('tbody tr').first().innerText(), /Bot_Alpha/);
  await page.getByRole('button', { name: 'Lịch sử trận đấu', exact: true }).click();
  await page.getByRole('cell', { name: 'CHECK_12', exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 10);
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await page.getByText('11–12 / 12 trận').waitFor();
  await page.getByRole('cell', { name: 'CHECK_01', exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 2);
  await page.getByRole('button', { name: 'Trang trước' }).click();
  await page.getByText('1–10 / 12 trận').waitFor();
  await page.getByRole('cell', { name: 'CHECK_12', exact: true }).waitFor();
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('aborted');
  await page.getByText('Chưa có trận đấu phù hợp trong database.').waitFor();
  await page.getByLabel('Trạng thái', { exact: true }).selectOption('finished');
  await page.getByRole('cell', { name: 'CHECK_12', exact: true }).waitFor();
  await page.getByLabel('Đội', { exact: true }).selectOption('alpha');
  await page.getByRole('cell', { name: 'CHECK_12', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Chi tiết', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Chi tiết trận CHECK_12' }).waitFor();
  mkdirSync(resolve('data/verification'), { recursive: true });
  await page.screenshot({ path: resolve('data/verification/history.png'), fullPage: true });
  await page.getByRole('button', { name: 'Xem replay', exact: true }).nth(1).click();
  await page.getByText('Trận CHECK_12', { exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /Bot_Alpha/);
  await page.getByTitle('Về cuối', { exact: true }).click();
  await page.locator('.banner.win').waitFor();
  assert.match(await page.locator('.banner.win').innerText(), /Bot_Alpha.*thắng/);
  await page.screenshot({ path: resolve('data/verification/replay.png'), fullPage: true });
  // Swap to a shorter replay to exercise the previously unsafe frame index.
  await page.getByRole('button', { name: '← Danh sách trận', exact: true }).click();
  await page.getByLabel('Mở replay mẫu').selectOption('Mẫu v1 (cũ)');
  await page.getByRole('button', { name: 'Bảng xếp hạng', exact: true }).click();
  await page.getByRole('cell', { name: '36', exact: true }).waitFor();
  await page.screenshot({ path: resolve('data/verification/rankings.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve('data/verification/mobile.png'), fullPage: true });
  await new Promise(resolve => backend.close(resolve));
  await page.getByRole('button', { name: 'Tải lại', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /backend/);
  assert.deepEqual(errors, []);
  console.log('PASS: SQLite → HTTP API → Vite proxy → React rankings/history/detail/replay, pagination, filters, empty/error states, mobile; no page errors.');
} finally {
  await browser?.close();
  await frontend?.close();
  if (backend.listening) await new Promise(resolve => backend.close(resolve));
  store.close();
  // mkdtempSync returns a dedicated absolute directory under tmpdir.
  assert.ok(dir.startsWith(join(tmpdir(), 'ltm-ui-check-')));
  rmSync(dir, { recursive: true });
}
