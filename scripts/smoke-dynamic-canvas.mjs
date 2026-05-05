// β6.0-α smoke: パズルサイズ毎に canvas 解像度が切り替わるか
import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const TARGETS = [
  { title: 'ハート', expected: 480 },
  { title: 'ねこ', expected: 600 },
  { title: 'うさぎ', expected: 720 },
  { title: 'ドラゴン', expected: 1000 },
];

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  for (const t of TARGETS) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

    await page.goto(URL, { waitUntil: 'networkidle' });
    const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
    await gate.dispatchEvent('pointerdown');
    await page.waitForSelector('.puzzle-select', { timeout: 5000 });
    const btn = await page.waitForSelector(`.puzzle-select button:has-text("${t.title}")`, { timeout: 5000 });
    await btn.click();
    await page.waitForSelector('.hud', { timeout: 5000 });
    await page.waitForTimeout(500);

    const { canvasW, canvasH } = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return { canvasW: c.width, canvasH: c.height };
    });
    const ok = canvasW === t.expected && canvasH === t.expected;
    console.log(`[${t.title}] expected ${t.expected}, got ${canvasW}x${canvasH}: ${ok ? 'OK' : 'NG'}`);
    await ctx.close();
  }

  console.log('[step] OK');
} finally {
  await browser.close();
}
