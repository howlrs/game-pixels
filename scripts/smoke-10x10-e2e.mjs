// Round 7-D smoke E2E: 10x10 パズルが選択画面に出て、選んでロードできることを確認。
// 実際のクリアまではしない (10x10 = 100マス、自動入力面倒のため)。

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'networkidle' });
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });

  // 10x10 セクションが存在し、8 個のボタンがあること
  const tenSection = await page.$('section:has(h2:text("10x10"))');
  const tenButtons = await page.$$('section:has(h2:text("10x10")) button');
  console.log('[step] 10x10 section exists:', tenSection !== null, '/ button count:', tenButtons.length);

  // 各ボタンのタイトルを取得
  const titles = await Promise.all(tenButtons.map((b) => b.$eval('strong', (el) => el.textContent)));
  console.log('[step] 10x10 puzzles:', titles);

  await page.screenshot({ path: '/tmp/round7d-puzzle-select.png', fullPage: false });

  // ねこを選んでロード
  const cat = await page.waitForSelector('.puzzle-select button:has-text("ねこ")', { timeout: 5000 });
  await cat.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/round7d-cat-board.png', fullPage: false });

  // 盤面が 10x10 になっているはず (canvas の解像度は 480 のままで内部スケーリング)
  console.log('[step] cat puzzle loaded, screenshot saved');
  console.log('[step] OK');
} finally {
  await browser.close();
}
