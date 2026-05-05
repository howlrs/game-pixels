// Step B: bitECS world + 固定タイムステップループの動作確認。
// 2 体のボックスが落下/反射し、フレーム間で座標が変化することを Playwright で確認。

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message }));

  await page.goto(URL, { waitUntil: 'networkidle' });
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.hud', { timeout: 5000 });

  // ボックスの座標変化を確認するため、Pixi.js の stage を window 経由で公開していないので
  // 代わりに 2 枚のスクリーンショットを撮って差分が出ることを確認する。
  await page.waitForTimeout(200);
  const shot1 = await page.locator('.canvas-container > canvas').screenshot();
  await page.waitForTimeout(400);
  const shot2 = await page.locator('.canvas-container > canvas').screenshot();
  const sameSize = shot1.length === shot2.length;
  // 完全一致でなければ動いている (バイト単位で一致しないことを確認)
  let diff = 0;
  const limit = Math.min(shot1.length, shot2.length);
  for (let i = 0; i < limit; i++) if (shot1[i] !== shot2[i]) diff++;

  await page.waitForTimeout(500);
  const fpsText = await page.$eval('.hud', (el) => {
    const m = el.innerText.match(/FPS\s+(\d+)/);
    return m ? m[1] : null;
  });
  const timerText = await page.$eval('.hud', (el) => {
    const m = el.innerText.match(/TIME\s+(\d+)/);
    return m ? m[1] : null;
  });

  const result = {
    ok: true,
    canvasMoving: { sameSize, diffBytes: diff, totalBytes: limit, diffRatio: limit ? diff / limit : 0 },
    fpsAfter1100ms: fpsText,
    timerAfter1100ms: timerText,
    errors: consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror'),
  };

  console.log(JSON.stringify(result, null, 2));

  await page.screenshot({ path: '/tmp/mario-pixel-step-b.png', fullPage: false });
  console.error('[smoke-e2e] screenshot saved to /tmp/mario-pixel-step-b.png');
} finally {
  await browser.close();
}
