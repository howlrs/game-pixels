// β2.0-γ smoke: ResultsPage の「📤 シェア」ボタン動作確認
// Web Share API は Playwright Linux Chromium ヘッドレスでは未実装なので
// clipboard fallback (✓ コピーしました) を期待する。

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

async function clearHeart(page) {
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heart.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(400);

  const canvas = page.locator('.canvas-container > canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  // canvas の内部解像度を取得 (720 のはず)
  const { canvasW, canvasH } = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { canvasW: c.width, canvasH: c.height };
  });

  const heartGrid = [
    [0,1,0,1,0],
    [1,1,1,1,1],
    [1,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ];
  // 内部解像度から layout を逆算 (grid.ts と同じ式):
  // availW = canvasW - 16, availH = canvasH - 16 - 16
  // rowHintMaxLen = 2 (ハート)、colHintMaxLen = 1 (ハートの最大列ヒント長)
  // cellByW = availW / (5 + 2*0.6) = availW / 6.2
  // cellByH = availH / (5 + 1*0.5) = availH / 5.5
  // cellPx = max(16, min(cellByW, cellByH))
  const availW = canvasW - 16;
  const availH = canvasH - 32;
  const cellByW = availW / 6.2;
  const cellByH = availH / 5.5;
  const cellPx = Math.max(16, Math.floor(Math.min(cellByW, cellByH)));
  const hintLeft = Math.ceil(2 * cellPx * 0.6);
  const hintTop = Math.ceil(1 * cellPx * 0.5);
  const totalW = hintLeft + 5 * cellPx;
  const totalH = hintTop + 5 * cellPx;
  const offsetX = Math.floor((canvasW - totalW) / 2);
  const offsetY = Math.floor((canvasH - totalH) / 2);
  const boardLeftPx = offsetX + hintLeft;
  const boardTopPx = offsetY + hintTop;

  const sx = box.width / canvasW;
  const sy = box.height / canvasH;

  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (heartGrid[r][c] === 1) {
    const ix = boardLeftPx + c * cellPx + cellPx/2;
    const iy = boardTopPx + r * cellPx + cellPx/2;
    await page.mouse.click(box.x + ix * sx, box.y + iy * sy);
  }
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await clearHeart(page);
  console.log('[step] cleared');
  await page.waitForSelector('.results-page', { timeout: 5000 });
  console.log('[step] results-page shown');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/beta2g-results.png', fullPage: false });

  const shareBtn = await page.waitForSelector('.results-actions button.share', { timeout: 5000 });
  console.log('[step] share button found');

  await shareBtn.click();
  await page.waitForTimeout(800);
  const labelAfter = await page.$eval('.results-actions button.share', (el) => el.textContent);
  console.log('[step] share button label after click:', labelAfter);

  // clipboard 内容も確認 (permission 与えてあれば読める)
  try {
    const clipText = await page.evaluate(() => navigator.clipboard.readText());
    console.log('[step] clipboard content:', clipText);
  } catch (e) {
    console.log('[step] clipboard read failed (期待される):', String(e).slice(0, 80));
  }

  await page.screenshot({ path: '/tmp/beta2g-after-share.png', fullPage: false });
  console.log('[step] OK');
} finally {
  await browser.close();
}
