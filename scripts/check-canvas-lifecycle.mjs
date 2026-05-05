import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1024, height: 768 } });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'networkidle' });

// tap-to-start 段階でも canvas-container が DOM に存在すること (display:none で隠れているだけ)
const canvasAtStart = await page.evaluate(() => {
  const wrap = document.querySelector('.canvas-container');
  return wrap ? {
    exists: true,
    display: getComputedStyle(wrap.parentElement).display,
    parentAriaHidden: wrap.parentElement.getAttribute('aria-hidden'),
    canvasInside: wrap.querySelector('canvas') !== null,
  } : { exists: false };
});
console.log('[start] canvas state:', canvasAtStart);

// スタートして playing に
const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
await gate.dispatchEvent('pointerdown');
await page.waitForSelector('.puzzle-select', { timeout: 5000 });

const canvasAtSelect = await page.evaluate(() => {
  const wrap = document.querySelector('.canvas-container');
  return wrap ? {
    exists: true,
    parentDisplay: getComputedStyle(wrap.parentElement).display,
    parentAriaHidden: wrap.parentElement.getAttribute('aria-hidden'),
    canvasInside: wrap.querySelector('canvas') !== null,
  } : { exists: false };
});
console.log('[puzzle-select] canvas state:', canvasAtSelect);

const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
await heart.click();
await page.waitForSelector('.hud', { timeout: 5000 });
await page.waitForTimeout(300);

const canvasAtPlaying = await page.evaluate(() => {
  const wrap = document.querySelector('.canvas-container');
  return wrap ? {
    exists: true,
    parentDisplay: getComputedStyle(wrap.parentElement).display,
    parentAriaHidden: wrap.parentElement.getAttribute('aria-hidden'),
  } : { exists: false };
});
console.log('[playing] canvas state:', canvasAtPlaying);

await browser.close();
