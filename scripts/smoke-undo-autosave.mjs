// β8.0-β smoke: ハートを 3 セル塗って reload → 同じハートを開くと塗りが復元 + undo 履歴も残る
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

  // Z で 3 セル塗る (カーソル移動も含めて)
  await page.keyboard.press('z'); // (0,0)
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('z'); // (1,0)
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('z'); // (2,0)
  await page.waitForTimeout(200);

  // autoSave debounce が 1.5 秒なので待つ
  await page.waitForTimeout(2000);

  // localStorage にデータが入っているか確認
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('pixels-savedata-v1');
    return raw ? JSON.parse(raw) : null;
  });
  const heartActive = saved?.activePuzzles?.heart;
  console.log('[step] heart active saved:', heartActive ? {
    cells_len: heartActive.cells?.length,
    history_len: heartActive.history?.length,
    historyCursor: heartActive.historyCursor,
  } : 'NULL');

  // リロード
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('button.gate', { timeout: 5000 });
  await page.dispatchEvent('button.gate', 'pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  // ハートには ✓ マークなしだが、選んで開くと塗り復元
  await (await page.waitForSelector('.puzzle-select button:has-text("ハート")')).click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(400);

  // この時点で board の (0,0)(1,0)(2,0) が FILLED になっているはず + undo 可能
  const undoBtn = await page.$('.hud-icon-btn[aria-label="元に戻す"]');
  const undoDisabled = await undoBtn.evaluate((el) => el.disabled);
  console.log('[step] after reload+reopen — undo disabled:', undoDisabled, '(false なら履歴復元 OK)');

  // 念のため Ctrl+Z で 1 セル戻せるか
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const undoAfter1 = await undoBtn.evaluate((el) => el.disabled);
  console.log('[step] after Ctrl+Z — still possible:', !undoAfter1);

  await page.screenshot({ path: '/tmp/beta8b-after-reload.png', fullPage: false });
  console.log('[step] OK');
} finally {
  await browser.close();
}
