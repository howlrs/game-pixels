// Step D: ステージロード + タイル描画 + AABB タイル衝突 + ゴール接触判定の動作確認。
// 1. Tap to Start → ステージが描画され、青いプレイヤーが床にいる
// 2. ArrowRight + Space を組み合わせて右に進ませる → スクリーンショットが変化
// 3. console に "STAGE CLEAR!" のログが出るところまで進めば最高

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

  // 落ち着き
  await page.waitForTimeout(400);
  const initial = await page.locator('.canvas-container > canvas').screenshot();

  // 右移動: ArrowRight を押し続ける + 時々 Space (ジャンプ) を押す
  const RUN_TIME_MS = 6000;
  await page.keyboard.down('ArrowRight');
  const t0 = Date.now();
  let cleared = false;
  while (Date.now() - t0 < RUN_TIME_MS) {
    await page.waitForTimeout(400);
    // 200ms 押して 200ms 放す = 短いジャンプの繰り返し
    await page.keyboard.down('Space');
    await page.waitForTimeout(120);
    await page.keyboard.up('Space');
    if (consoleMessages.some((m) => m.text.includes('STAGE CLEAR'))) {
      cleared = true;
      break;
    }
  }
  await page.keyboard.up('ArrowRight');

  await page.waitForTimeout(300);
  const final = await page.locator('.canvas-container > canvas').screenshot();

  function diffRatio(a, b) {
    const len = Math.min(a.length, b.length);
    let d = 0;
    for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++;
    return { ratio: len ? d / len : 0, bytes: d, total: len };
  }
  const initialVsFinal = diffRatio(initial, final);

  const fpsText = await page.$eval('.hud', (el) => {
    const m = el.innerText.match(/FPS\s+(\d+)/);
    return m ? m[1] : null;
  });
  const scoreText = await page.$eval('.hud', (el) => {
    const m = el.innerText.match(/SCORE\s+(\d+)/);
    return m ? m[1] : null;
  });

  const result = {
    ok: true,
    cleared,
    initialVsFinal,
    fps: fpsText,
    score: scoreText,
    consoleClear: consoleMessages.find((m) => m.text.includes('STAGE CLEAR'))?.text ?? null,
    consoleMount: consoleMessages.find((m) => m.text.includes('mountPixi (Step D)'))?.text ?? null,
    errors: consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror'),
  };
  console.log(JSON.stringify(result, null, 2));

  await page.screenshot({ path: '/tmp/mario-pixel-step-d.png', fullPage: false });
  console.error('[smoke-e2e] screenshot saved to /tmp/mario-pixel-step-d.png');
} finally {
  await browser.close();
}
