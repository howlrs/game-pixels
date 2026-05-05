// Round 7-E smoke: 全カテゴリ (5x5/10x10/15x15/25x25) のセクションが表示され、
// 各サイズのパズルがロードできることを確認

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });

  const sizes = ['5x5', '10x10', '15x15', '25x25'];
  for (const sz of sizes) {
    const sec = await page.$(`section:has(h2:text("${sz}"))`);
    const buttons = await page.$$(`section:has(h2:text("${sz}")) button`);
    console.log(`[${sz}] section=${sec !== null}, buttons=${buttons.length}`);
  }
  await page.screenshot({ path: '/tmp/round7e-puzzle-select.png', fullPage: true });

  // 25x25 ドラゴンをロード
  const dragon = await page.waitForSelector('.puzzle-select button:has-text("ドラゴン")', { timeout: 5000 });
  await dragon.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/round7e-dragon-board.png', fullPage: false });
  console.log('[25x25] dragon loaded');

  console.log('pageerrors:', errs);
} finally {
  await browser.close();
}
