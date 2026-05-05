// Round 6 後フィックス smoke E2E: グリッド線の抜け修正 + クリア後の自動遷移確認。
// 1. TAP TO START → パズル選択 → ハート選択 → 盤面 (スクショ取得、グリッド線抜けを目視チェック対象に)
// 2. 16 マスクリックでクリア演出 + カウントダウン表示
// 3. 約 3.5 秒待ってパズル選択画面に自動遷移していることを確認

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message }));

  await page.goto(URL, { waitUntil: 'networkidle' });

  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');

  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const heartButton = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heartButton.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(500);

  // 盤面スクリーンショット (グリッド線抜けチェック対象)
  await page.screenshot({ path: '/tmp/pixels-fix-board.png', fullPage: false });

  // 16 マスクリック (ハート solution の塗マス)
  const canvas = await page.locator('.canvas-container > canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const heart = [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];
  const boardLeftInternal = 76;
  const boardTopInternal = 76;
  const cellPxInternal = 80;
  const scaleX = box.width / 480;
  const scaleY = box.height / 480;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (heart[r][c] === 1) {
        const ix = boardLeftInternal + c * cellPxInternal + cellPxInternal / 2;
        const iy = boardTopInternal + r * cellPxInternal + cellPxInternal / 2;
        await page.mouse.click(box.x + ix * scaleX, box.y + iy * scaleY, { button: 'left' });
      }
    }
  }
  await page.waitForTimeout(800);

  // クリア演出表示 (countdown あり)
  const overlayJustAfter = await page.$('.clear-overlay');
  await page.screenshot({ path: '/tmp/pixels-fix-cleared.png', fullPage: false });
  const countdownText = await page.$eval('.clear-countdown', (el) => el.textContent ?? '').catch(() => null);

  // 自動遷移 (3 秒後にパズル選択画面に戻るはず)
  // 余裕をもって 3.5 秒待つ
  await page.waitForTimeout(3500);

  const overlayAfterTimeout = await page.$('.clear-overlay');
  const puzzleSelectAfter = await page.$('.puzzle-select');
  await page.screenshot({ path: '/tmp/pixels-fix-after-auto-return.png', fullPage: false });

  const result = {
    ok: true,
    overlayJustAfterClear: overlayJustAfter !== null,
    countdownText,
    overlayDisappearedAfterTimeout: overlayAfterTimeout === null,
    returnedToPuzzleSelect: puzzleSelectAfter !== null,
    errors: consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror'),
  };
  console.log(JSON.stringify(result, null, 2));
  console.error('[smoke-e2e] screenshots: /tmp/pixels-fix-{board,cleared,after-auto-return}.png');
} finally {
  await browser.close();
}
