// Step C: 入力 + プレイヤー物理の動作確認。
// 1. Tap to Start でゲーム開始 → プレイヤー (青いボックス) が静止して床にいる
// 2. ArrowRight を押し続ける → スクリーンショット差分で右移動を確認
// 3. Space (ジャンプ) を押す → スクリーンショット差分で上下移動を確認

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

  // 落ち着くまで待つ (床に着地)
  await page.waitForTimeout(500);
  const idle = await page.locator('.canvas-container > canvas').screenshot();

  // 右移動: ArrowRight を 600ms 押し続ける
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  const moving = await page.locator('.canvas-container > canvas').screenshot();
  await page.keyboard.up('ArrowRight');

  // 静止待ち (摩擦で停止)
  await page.waitForTimeout(800);
  const settled = await page.locator('.canvas-container > canvas').screenshot();

  // ジャンプ: Space を一瞬押す → 0.2s 後にスクショ
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  await page.keyboard.up('Space');
  const jumping = await page.locator('.canvas-container > canvas').screenshot();

  // 着地まで待つ
  await page.waitForTimeout(800);
  const landed = await page.locator('.canvas-container > canvas').screenshot();

  function diffRatio(a, b) {
    const len = Math.min(a.length, b.length);
    let d = 0;
    for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++;
    return { ratio: len ? d / len : 0, bytes: d, total: len };
  }

  const idleVsMoving = diffRatio(idle, moving);
  const idleVsSettled = diffRatio(idle, settled);
  const settledVsJumping = diffRatio(settled, jumping);
  const settledVsLanded = diffRatio(settled, landed);

  const fpsText = await page.$eval('.hud', (el) => {
    const m = el.innerText.match(/FPS\s+(\d+)/);
    return m ? m[1] : null;
  });

  const result = {
    ok: true,
    idleVsMoving,           // 大: 右移動した
    idleVsSettled,          // 小: 移動後ほぼ同じ位置に戻った...わけではないが、停止点との比較
    settledVsJumping,       // 大: ジャンプで上下動
    settledVsLanded,        // 小: 着地したのでほぼ元と同じ
    fps: fpsText,
    errors: consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror'),
  };
  console.log(JSON.stringify(result, null, 2));

  await page.screenshot({ path: '/tmp/mario-pixel-step-c.png', fullPage: false });
  console.error('[smoke-e2e] screenshot saved to /tmp/mario-pixel-step-c.png');
} finally {
  await browser.close();
}
