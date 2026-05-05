// β4.0-β smoke: SettingsModal の highContrast チェック ON で body[data-high-contrast]
// が即時付与され、UI と Pixi.js 盤面の配色が切り替わる
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
  const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heart.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(400);

  const beforeAttr = await page.evaluate(() => document.body.dataset.highContrast ?? null);
  console.log('[step] highContrast (initial):', beforeAttr);
  await page.screenshot({ path: '/tmp/beta4b-board-default.png', fullPage: false });

  // 設定 → ハイコントラスト ON
  await (await page.waitForSelector('.hud-icon-btn[aria-label="設定を開く"]')).click();
  await page.waitForSelector('.settings-modal', { timeout: 5000 });
  // toggle 配列の 3 番目 = highContrast (audio.muteOnBlur=0, a11y.reduceMotion=1, a11y.highContrast=2)
  const cb = (await page.$$('.settings-toggle input[type="checkbox"]'))[2];
  await cb.click();
  await page.waitForTimeout(150);
  const afterAttr = await page.evaluate(() => document.body.dataset.highContrast ?? null);
  console.log('[step] highContrast (after toggle ON):', afterAttr);

  // モーダル閉じて盤面確認
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/beta4b-board-hc.png', fullPage: false });
  console.log('[step] HC board screenshot saved');

  // リロードして永続化確認
  await page.reload({ waitUntil: 'networkidle' });
  const postReload = await page.evaluate(() => document.body.dataset.highContrast ?? null);
  console.log('[step] highContrast (after reload):', postReload);

  console.log('[step] OK');
} finally {
  await browser.close();
}
