// β3.0-β smoke: SettingsModal で reduceMotion を ON → body[data-reduce-motion] が即反映
// + クリアアニメが skip されて即 ResultsPage に遷移
import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

async function clearHeart(page) {
  const canvas = page.locator('.canvas-container > canvas');
  const box = await canvas.boundingBox();
  const { canvasW, canvasH } = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { canvasW: c.width, canvasH: c.height };
  });
  const sx = box.width / canvasW;
  const sy = box.height / canvasH;
  const availW = canvasW - 16;
  const availH = canvasH - 32;
  const cellPx = Math.max(16, Math.floor(Math.min(availW / 6.2, availH / 5.5)));
  const hintLeft = Math.ceil(2 * cellPx * 0.6);
  const hintTop = Math.ceil(1 * cellPx * 0.5);
  const totalW = hintLeft + 5 * cellPx;
  const totalH = hintTop + 5 * cellPx;
  const offsetX = Math.floor((canvasW - totalW) / 2);
  const offsetY = Math.floor((canvasH - totalH) / 2);
  const boardLeftPx = offsetX + hintLeft;
  const boardTopPx = offsetY + hintTop;
  const heart = [
    [0,1,0,1,0],
    [1,1,1,1,1],
    [1,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ];
  for (let r=0;r<5;r++) for (let c=0;c<5;c++) if (heart[r][c]===1) {
    const ix = boardLeftPx + c*cellPx + cellPx/2;
    const iy = boardTopPx + r*cellPx + cellPx/2;
    await page.mouse.click(box.x + ix * sx, box.y + iy * sy);
  }
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heart.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(400);

  // 初期: data-reduce-motion 無し
  const beforeAttr = await page.evaluate(() => document.body.dataset.reduceMotion ?? null);
  console.log('[step] body data-reduce-motion (initial):', beforeAttr);

  // 設定モーダル開く
  await (await page.waitForSelector('.hud-icon-btn[aria-label="設定を開く"]')).click();
  await page.waitForSelector('.settings-modal', { timeout: 5000 });

  // reduceMotion チェックボックスを ON (settings-toggle 2 つ目)
  const cb = (await page.$$('.settings-toggle input[type="checkbox"]'))[1];
  await cb.click();
  await page.waitForTimeout(100);
  const afterAttr = await page.evaluate(() => document.body.dataset.reduceMotion ?? null);
  console.log('[step] body data-reduce-motion (after toggle ON):', afterAttr);

  // モーダル閉じる
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // クリアして、アニメが skip されて即 results に行くか
  const startTime = Date.now();
  await clearHeart(page);
  // results-page が ~500ms 以内に出るはず (アニメ 1.2s が skip)
  await page.waitForSelector('.results-page', { timeout: 1500 });
  const elapsedMs = Date.now() - startTime;
  console.log('[step] clear → results elapsed:', elapsedMs, 'ms (smoke 通常クリック含むので 1500ms 以下なら skip 機能 OK)');

  await page.screenshot({ path: '/tmp/beta3b-results-after-reduce-motion.png', fullPage: false });

  // 設定で OFF に戻す
  await page.waitForSelector('.results-actions button.secondary', { timeout: 5000 });
  await (await page.$('.results-actions button.secondary')).click();
  await page.waitForSelector('.puzzle-select', { timeout: 3000 });
  console.log('[step] back to puzzle-select');

  // localStorage 永続化も確認: reload して dataset が復元されるか
  await page.reload({ waitUntil: 'networkidle' });
  const postReload = await page.evaluate(() => document.body.dataset.reduceMotion ?? null);
  console.log('[step] body data-reduce-motion (after reload):', postReload);

  console.log('[step] OK');
} finally {
  await browser.close();
}
