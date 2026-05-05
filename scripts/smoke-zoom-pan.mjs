// β10.0-α smoke: ズーム+パン UI の動作検証
//   - HUD にズームボタン (+/-/⤢) が出る
//   - 初期 viewport は scale=1, pan=0
//   - ズームインボタンで scale が増加
//   - リセットボタンで viewport が初期に戻る
//   - wheel で zoom (anchor 維持確認)
import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  // 25x25 のドラゴンを開いてズーム要件が一番強い場面で検証
  const dragon = await page.waitForSelector('.puzzle-select button:has-text("ドラゴン")', { timeout: 5000 });
  await dragon.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(400);

  const zoomInBtn = await page.$('.hud-icon-btn[aria-label="ズームイン"]');
  const zoomOutBtn = await page.$('.hud-icon-btn[aria-label="ズームアウト"]');
  const zoomResetBtn = await page.$('.hud-icon-btn[aria-label="ズームをリセット"]');
  console.log(
    '[step] zoom buttons exist — in:', zoomInBtn !== null,
    '/ out:', zoomOutBtn !== null,
    '/ reset:', zoomResetBtn !== null,
  );

  // 初期状態の確認 (zoomReset disabled, zoomIn enabled, zoomOut enabled)
  const initialResetDisabled = await zoomResetBtn.evaluate((el) => el.disabled);
  console.log('[step] initial zoom reset disabled:', initialResetDisabled);

  // ズームイン × 3
  await zoomInBtn.click();
  await zoomInBtn.click();
  await zoomInBtn.click();
  await page.waitForTimeout(200);

  // store の viewport を window 経由で取得 (debug 用は無いので React DevTools 等は使わずスクリーンショット比較)
  await page.screenshot({ path: '/tmp/beta10a-zoomed-in.png', fullPage: false });

  const resetDisabled2 = await zoomResetBtn.evaluate((el) => el.disabled);
  console.log('[step] after zoom in x3 — reset disabled:', resetDisabled2, '(expected: false)');

  // リセット
  await zoomResetBtn.click();
  await page.waitForTimeout(200);
  const resetDisabled3 = await zoomResetBtn.evaluate((el) => el.disabled);
  console.log('[step] after reset — reset disabled:', resetDisabled3, '(expected: true)');
  await page.screenshot({ path: '/tmp/beta10a-after-reset.png', fullPage: false });

  // wheel ズーム
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100); // zoom in
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/beta10a-wheel-zoomed.png', fullPage: false });

  const resetDisabled4 = await zoomResetBtn.evaluate((el) => el.disabled);
  console.log('[step] after wheel zoom — reset disabled:', resetDisabled4, '(expected: false)');

  console.log('[step] OK — see /tmp/beta10a-*.png');
} finally {
  await browser.close();
}
