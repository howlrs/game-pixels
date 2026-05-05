// 実装スケルトンの bun dev 動作を Playwright で smoke 検証する。
// React 統合後 (Step A): #app-root に React がマウントされ、TapToStartGate が表示される。
// タップ → GameView 内の Canvas が表示され、HUD が出ることを確認。

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu'],
});
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message }));

  await page.goto(URL, { waitUntil: 'networkidle' });

  // 初期: TapToStartGate が表示
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  const gateText = (await gate.innerText()).trim();

  // Canvas は背後で初期化済 (Tap-to-Start ゲートの裏で)
  const canvasBefore = await page.$('.canvas-container > canvas');
  const hasCanvasBefore = canvasBefore !== null;

  // Tap-to-Start (pointerdown) して playing フェーズへ
  await gate.dispatchEvent('pointerdown');

  // HUD が出る
  const hud = await page.waitForSelector('.hud', { timeout: 5000 });
  const hudText = (await hud.innerText()).replace(/\s+/g, ' ').trim();

  // Canvas が依然として残っている (= React 再レンダリングで Canvas が破棄されていない)
  const canvasAfter = await page.$('.canvas-container > canvas');
  const canvasInfo = canvasAfter
    ? await canvasAfter.evaluate((el) => ({
        width: el.width,
        height: el.height,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      }))
    : null;

  // gate が消えている
  const gateGone = (await page.$('button.gate')) === null;

  // touch-action / box-sizing 確認
  const rootBoxSizing = await page.$eval('#app-root', (el) => window.getComputedStyle(el).boxSizing);
  const rootTouchAction = await page.$eval('html', (el) => window.getComputedStyle(el).touchAction);

  // FPS が 0 から増えるか (start() が呼ばれて ticker が動いている証拠)
  await page.waitForTimeout(800);
  const fpsText = await page.$eval('.hud', (el) => {
    const m = el.innerText.match(/FPS\s+(\d+)/);
    return m ? m[1] : null;
  });

  const result = {
    ok: true,
    gateText,
    hasCanvasBefore,
    hudText,
    canvas: canvasInfo,
    gateGone,
    rootBoxSizing,
    rootTouchAction,
    fpsTextAfter800ms: fpsText,
    errors: consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror'),
  };

  console.log(JSON.stringify(result, null, 2));

  await page.screenshot({ path: '/tmp/mario-pixel-step-a.png', fullPage: false });
  console.error('[smoke-e2e] screenshot saved to /tmp/mario-pixel-step-a.png');
} finally {
  await browser.close();
}
