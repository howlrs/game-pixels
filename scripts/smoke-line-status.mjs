// β3.0-α smoke: ハートを部分的に塗ると、完成した行/列のヒント数字が緑になる
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
  await page.waitForTimeout(500);

  await page.screenshot({ path: '/tmp/beta3a-init.png', fullPage: false });

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

  const click = async (c, r) => {
    const ix = boardLeftPx + c * cellPx + cellPx / 2;
    const iy = boardTopPx + r * cellPx + cellPx / 2;
    await page.mouse.click(box.x + ix * sx, box.y + iy * sy);
  };

  // ハート solution[4] = [0,0,1,0,0] → row=4 完成のため col=2 のみ塗
  await click(2, 4);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/beta3a-row4-done.png', fullPage: false });
  console.log('[step] row 4 (last row) painted');

  // col=2 完成: solution の col 2 = [0,1,1,1,1] → row 1,2,3 を追加塗 (row 4 は既に塗済)
  await click(2, 1);
  await click(2, 2);
  await click(2, 3);
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/beta3a-col2-done.png', fullPage: false });
  console.log('[step] col 2 (center) completed');

  console.log('[step] OK');
} finally {
  await browser.close();
}
