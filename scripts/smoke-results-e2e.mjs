// Round 7-A smoke E2E: ResultsPage の表示確認 + 各アクション検証
// 1. パズル選択 → ハート選択 → クリア
// 2. ClearOverlay (1.5 秒) → ResultsPage に遷移
// 3. ResultsPage に他パズル一覧 / アクションボタンが表示される
// 4. 「もう一度」を押すと同じパズルがリロードされ phase='playing' に戻る
// 5. 「パズル選択へ」を押すと PuzzleSelect に遷移する

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

async function clearHeart(page) {
  // Tap to start
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const heartButton = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heartButton.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(500);

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
}

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const messages = [];
  page.on('console', (msg) => messages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => messages.push({ type: 'pageerror', text: err.message }));

  await page.goto(URL, { waitUntil: 'networkidle' });
  console.log('[step] page loaded');

  await clearHeart(page);
  console.log('[step] cleared puzzle');

  // ClearOverlay 出現確認
  const overlayShown = await page.$('.clear-overlay');
  console.log('[step] clear-overlay shown:', overlayShown !== null);
  await page.screenshot({ path: '/tmp/round7a-cleared.png', fullPage: false });

  // 1.5 秒 + 余裕で 2 秒待つ → ResultsPage に遷移
  await page.waitForTimeout(2000);
  const overlayGone = (await page.$('.clear-overlay')) === null;
  const resultsShown = (await page.$('.results-page')) !== null;
  console.log('[step] clear-overlay disappeared:', overlayGone, '/ results-page shown:', resultsShown);
  await page.screenshot({ path: '/tmp/round7a-results.png', fullPage: false });

  // ResultsPage の中身確認
  const titleText = await page.$eval('.results-header h1', (el) => el.textContent ?? '').catch(() => null);
  const timeText = await page.$eval('.results-time-value', (el) => el.textContent ?? '').catch(() => null);
  const miniatureExists = (await page.$('.results-miniature')) !== null;
  const otherPuzzleCount = (await page.$$('.results-puzzle-list button')).length;
  const replayBtn = await page.$('.results-actions button.primary');
  const backBtn = await page.$('.results-actions button.secondary');

  console.log('[step] results content:', { titleText, timeText, miniatureExists, otherPuzzleCount });

  // aria-modal 確認
  const ariaModal = await page.getAttribute('.results-page', 'aria-modal');
  console.log('[step] aria-modal:', ariaModal);

  // フォーカス確認
  const focusedTag = await page.evaluate(() => document.activeElement?.textContent ?? null);
  console.log('[step] focused element text:', focusedTag);

  // 「もう一度」ボタンクリック → phase='playing' に戻ることを確認
  await replayBtn.click();
  await page.waitForTimeout(500);
  const playingShown = (await page.$('.hud')) !== null;
  const resultsGone = (await page.$('.results-page')) === null;
  console.log('[step] after replay: playing shown:', playingShown, '/ results gone:', resultsGone);
  await page.screenshot({ path: '/tmp/round7a-after-replay.png', fullPage: false });

  // もう一度クリア → 「パズル選択へ」を押す
  await clearHeart(page);
  await page.waitForTimeout(2000);
  const backBtn2 = await page.$('.results-actions button.secondary');
  await backBtn2.click();
  await page.waitForTimeout(500);
  const puzzleSelectShown = (await page.$('.puzzle-select')) !== null;
  console.log('[step] after back-to-select: puzzle-select shown:', puzzleSelectShown);
  await page.screenshot({ path: '/tmp/round7a-after-back.png', fullPage: false });

  const result = {
    overlayShown: overlayShown !== null,
    overlayGone,
    resultsShown,
    titleContainsHeart: titleText?.includes('ハート'),
    timeNotEmpty: timeText && timeText.length > 0,
    miniatureExists,
    otherPuzzleCount,
    ariaModal,
    focusedOnReplay: focusedTag?.includes('もう一度'),
    afterReplay: { playingShown, resultsGone },
    afterBack: { puzzleSelectShown },
    pageerrors: messages.filter((m) => m.type === 'pageerror'),
    consoleerrors: messages.filter((m) => m.type === 'error'),
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
