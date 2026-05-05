// Round 7-B smoke E2E: クリア時のセル回転アニメ → ResultsPage 遷移を確認。
// 1. クリアまで進める
// 2. ClearBanner (上部バナー) が表示される
// 3. ~1.5 秒待つと自動で ResultsPage に遷移
// 4. アニメ中の中間スクショも撮る
// 5. prefers-reduced-motion: reduce では即遷移

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

async function clearHeart(page) {
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heart.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(300);

  const canvas = page.locator('.canvas-container > canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas not found');
  const heartGrid = [
    [0,1,0,1,0],
    [1,1,1,1,1],
    [1,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ];
  const sx = box.width/480, sy = box.height/480;
  for (let r=0;r<5;r++) for (let c=0;c<5;c++) if (heartGrid[r][c]===1) {
    await page.mouse.click(box.x + (76 + c*80 + 40)*sx, box.y + (76 + r*80 + 40)*sy);
  }
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  // Test 1: 通常 (アニメ有効)
  {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    const messages = [];
    page.on('console', (m) => messages.push({ type: m.type(), text: m.text() }));
    page.on('pageerror', (e) => messages.push({ type: 'pageerror', text: e.message }));

    await page.goto(URL, { waitUntil: 'networkidle' });
    await clearHeart(page);
    console.log('[normal] cleared');

    const bannerShown = (await page.$('.clear-banner')) !== null;
    const overlayShouldBeGone = (await page.$('.clear-overlay')) === null;
    await page.screenshot({ path: '/tmp/round7b-clear-banner.png' });
    console.log('[normal] clear-banner shown:', bannerShown, '/ old overlay gone:', overlayShouldBeGone);

    // mid-animation snapshot (~400ms in)
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/round7b-mid-anim.png' });
    console.log('[normal] mid-anim screenshot saved');

    // 全アニメ完了 + results 遷移を待つ (合計 ~1.5s)
    await page.waitForTimeout(1500);
    const resultsShown = (await page.$('.results-page')) !== null;
    const bannerGone = (await page.$('.clear-banner')) === null;
    await page.screenshot({ path: '/tmp/round7b-results.png' });
    console.log('[normal] results shown:', resultsShown, '/ banner gone:', bannerGone);
    console.log('[normal] pageerrors:', messages.filter(m => m.type === 'pageerror'));
    await ctx.close();
  }

  // Test 2: prefers-reduced-motion: reduce (即遷移)
  {
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1024, height: 768 },
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await clearHeart(page);
    console.log('[reduced] cleared');

    // 200ms 後には results に遷移しているはず (アニメ skip 時の同期遷移保証)
    await page.waitForTimeout(200);
    const resultsShownFast = (await page.$('.results-page')) !== null;
    await page.screenshot({ path: '/tmp/round7b-results-reduced.png' });
    console.log('[reduced] results shown after 200ms:', resultsShownFast);
    await ctx.close();
  }
} finally {
  await browser.close();
}
