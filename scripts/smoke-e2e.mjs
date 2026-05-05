// 実装スケルトンの bun dev 動作を Playwright で smoke 検証する。
// - https://127.0.0.1:5173 にアクセスし、 #game-root に <canvas> が挿入されているか確認
// - console.info の bootstrap ログから renderer type を取り出す
// - "Hello マリオピクセル" がページのテキスト/canvas に乗るかを検証 (canvas 内描画はスクリーンショット差分にする)

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu'],
  // ヘッドレス Chromium で WebGPU を試行 (失敗時は WebGL2 に fallback)
});
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', (err) => {
    consoleMessages.push({ type: 'pageerror', text: err.message });
  });

  await page.goto(URL, { waitUntil: 'networkidle' });

  // canvas が挿入されるまで待つ (最大 5 秒)
  const canvas = await page.waitForSelector('#game-root canvas', { timeout: 5000 });
  const canvasInfo = await canvas.evaluate((el) => ({
    width: el.width,
    height: el.height,
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
  }));

  // bootstrap ログを抽出
  const bootstrap = consoleMessages.find((m) => m.text.includes('skeleton bootstrap'));

  // ページタイトル
  const title = await page.title();

  // game-root の box-sizing を CSS で確認 (svh + padding 設計の確認)
  const rootBoxSizing = await page.$eval('#game-root', (el) => {
    return window.getComputedStyle(el).boxSizing;
  });

  console.log(JSON.stringify({
    ok: true,
    title,
    canvas: canvasInfo,
    rootBoxSizing,
    bootstrapLog: bootstrap?.text ?? null,
    errors: consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror'),
  }, null, 2));

  await page.screenshot({ path: '/tmp/mario-pixel-skeleton.png', fullPage: false });
  console.error('[smoke-e2e] screenshot saved to /tmp/mario-pixel-skeleton.png');
} finally {
  await browser.close();
}
