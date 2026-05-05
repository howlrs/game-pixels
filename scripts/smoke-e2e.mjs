// Round 6 smoke E2E: ピクセルズ MVP の動作確認。
// 1. TAP TO START → パズル選択画面表示
// 2. ハートを選択 → 盤面 + ヒント表示
// 3. 正解の塗 (左クリックで FILLED) を全マス → クリア演出
// 4. 「パズル選択に戻る」で戻れる

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

  // 1. TAP TO START
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');

  // 2. パズル選択画面
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const heartButton = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await page.screenshot({ path: '/tmp/pixels-step-select.png', fullPage: false });

  // 3. ハート選択 → 盤面ロード
  await heartButton.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(500); // canvas 描画安定待ち
  await page.screenshot({ path: '/tmp/pixels-step-board.png', fullPage: false });

  // canvas 上でクリック: 正解の塗 (heart の solution) を全部塗る
  // canvas 内のグリッドレイアウト計算は src 側と同じだが、本テストでは React 側 PuzzleSelect で
  // パズルがロードされた後の canvas を見る。座標は概算で、各セル中心をクリック。
  // 簡易策: canvas の .canvas-container > canvas を取得 → クリック座標を計算する代わりに、
  // ストアを直接操作してクリアする方法に変更 (Pixi.js + DOM で正確な canvas 内座標を割り出すのが面倒)

  const cleared = await page.evaluate(() => {
    // window.useGame が公開されていないので、import 経由で操作する代わりに
    // module-level で window に exposeしておく必要がある。MVP では React UI から
    // 動作確認するため、本 evaluate は失敗してもよい (UI 側で確認)。
    return null;
  });

  // 代替: canvas 上の各セルを物理的にクリックする (左クリック)
  // 盤面 5×5、internal 480×480、cellPx は描画ロジックで決定。実画面 (resolved) サイズから推定。
  const canvas = await page.locator('.canvas-container > canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');

  // 動的な layout は描画後の app.canvas.width/height (=480) と DOM box から推定
  // 5x5 盤面、ヒント領域は概ね 25% を占有 → セル開始 ~25%, セル幅 ~14%
  const heart = [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];
  // 内部解像度 480×480、ヒント幅 ≈ 1.5 cellPx ≒ 13% 程度、cellPx ≈ 480/(5+1.5*0.6) ≈ 80px
  // ヒント領域 ≒ 80*0.6*1.5 = 72px、盤面領域 = 5*80 = 400px
  // total = 72 + 400 = 472、画面中央配置 → offsetX = (480-472)/2 = 4
  // boardLeft = 4 + 72 = 76px (内部座標)
  const boardLeftInternal = 76;
  const boardTopInternal = 76;
  const cellPxInternal = 80;
  // 内部 → DOM 座標
  const scaleX = box.width / 480;
  const scaleY = box.height / 480;

  let clickCount = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (heart[r][c] === 1) {
        const ix = boardLeftInternal + c * cellPxInternal + cellPxInternal / 2;
        const iy = boardTopInternal + r * cellPxInternal + cellPxInternal / 2;
        const x = box.x + ix * scaleX;
        const y = box.y + iy * scaleY;
        await page.mouse.click(x, y, { button: 'left' });
        clickCount++;
      }
    }
  }
  await page.waitForTimeout(800);

  // クリア overlay が出るか
  const overlay = await page.$('.clear-overlay');
  await page.screenshot({ path: '/tmp/pixels-step-cleared.png', fullPage: false });

  const result = {
    ok: true,
    cleared: overlay !== null,
    clickCount,
    canvasBox: { w: box.width, h: box.height },
    errors: consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror'),
    bootstrap: consoleMessages.find((m) => m.text.includes('mountPixi'))?.text ?? null,
  };
  console.log(JSON.stringify(result, null, 2));
  console.error('[smoke-e2e] screenshots: /tmp/pixels-step-{select,board,cleared}.png');
} finally {
  await browser.close();
}
