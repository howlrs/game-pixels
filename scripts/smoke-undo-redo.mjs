// β5.0-α smoke: Undo/Redo ボタン + Cmd/Ctrl+Z/Y キーで board が巻戻る/進む
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

  const undoBtn = await page.$('.hud-icon-btn[aria-label="元に戻す"]');
  const redoBtn = await page.$('.hud-icon-btn[aria-label="やり直す"]');
  console.log('[step] buttons exist — undo:', undoBtn !== null, '/ redo:', redoBtn !== null);
  const undoDisabled1 = await undoBtn.evaluate((el) => el.disabled);
  const redoDisabled1 = await redoBtn.evaluate((el) => el.disabled);
  console.log('[step] initial disabled — undo:', undoDisabled1, '/ redo:', redoDisabled1);

  // 1 セル塗る (Z キー)
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  const undoDisabled2 = await undoBtn.evaluate((el) => el.disabled);
  console.log('[step] after Z paint — undo disabled:', undoDisabled2);

  // Ctrl+Z で undo
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const undoDisabled3 = await undoBtn.evaluate((el) => el.disabled);
  const redoDisabled3 = await redoBtn.evaluate((el) => el.disabled);
  console.log('[step] after Ctrl+Z — undo disabled:', undoDisabled3, '/ redo disabled:', redoDisabled3);

  // Ctrl+Y で redo
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);
  const undoDisabled4 = await undoBtn.evaluate((el) => el.disabled);
  const redoDisabled4 = await redoBtn.evaluate((el) => el.disabled);
  console.log('[step] after Ctrl+Y — undo disabled:', undoDisabled4, '/ redo disabled:', redoDisabled4);

  // ボタンクリックで undo
  await undoBtn.click();
  await page.waitForTimeout(200);
  const undoDisabled5 = await undoBtn.evaluate((el) => el.disabled);
  console.log('[step] after undo click — undo disabled:', undoDisabled5);

  await page.screenshot({ path: '/tmp/beta5a-final.png', fullPage: false });
  console.log('[step] OK');
} finally {
  await browser.close();
}
