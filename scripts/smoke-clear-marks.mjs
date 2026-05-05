// β6.0-β smoke: ハートをクリアした後 puzzle-select に戻ると ✓ マークが表示される
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
  await page.waitForTimeout(500);
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

  // 初期: マーク 0 / 全件 21 でクリア 0/21
  const initialOverall = await page.$eval('.puzzle-select-overall', (el) => el.textContent);
  console.log('[step] initial overall:', initialOverall);
  await page.screenshot({ path: '/tmp/beta6b-initial.png', fullPage: false });

  // ハート選択 → クリア → ResultsPage → 戻る
  const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heart.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(400);
  await clearHeart(page);
  // クリアアニメ + results 遷移
  await page.waitForSelector('.results-page', { timeout: 5000 });
  await (await page.$('.results-actions button.secondary')).click();
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });

  // 進捗が 1/21 になったか
  const overallAfter = await page.$eval('.puzzle-select-overall', (el) => el.textContent);
  console.log('[step] after clear overall:', overallAfter);

  // ハートに ✓ マークが付いたか
  const heartCleared = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.puzzle-select button'));
    const heart = buttons.find((b) => b.textContent.includes('ハート') && !b.textContent.includes('大'));
    return heart?.classList.contains('cleared') && heart.querySelector('.puzzle-cleared-mark') !== null;
  });
  console.log('[step] heart has cleared mark:', heartCleared);

  // 5x5 カテゴリヘッダの進捗
  const cat5x5 = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('.puzzle-select section'));
    const sec = sections.find((s) => s.querySelector('h2')?.textContent.includes('5x5'));
    return sec?.querySelector('.puzzle-select-cat-progress')?.textContent;
  });
  console.log('[step] 5x5 cat progress:', cat5x5);

  await page.screenshot({ path: '/tmp/beta6b-after-clear.png', fullPage: false });
  console.log('[step] OK');
} finally {
  await browser.close();
}
