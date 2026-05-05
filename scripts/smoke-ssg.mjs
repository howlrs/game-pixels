// β12.0-α SSG smoke: 各 path への直接アクセスで該当 puzzle が即ロードされるか確認
import { chromium } from 'playwright';

const BASE = 'https://127.0.0.1:4173';

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  // 1. /puzzles/15x15/rabbit/ → 直接うさぎが表示されるか
  await page.goto(`${BASE}/puzzles/15x15/rabbit/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.hud', { timeout: 5000 });
  const title1 = await page.title();
  console.log('[1] /puzzles/15x15/rabbit/ → title:', title1);
  await page.screenshot({ path: '/tmp/ssg-rabbit.png', fullPage: false });

  // 2. /puzzles/ → 全カテゴリ index
  await page.goto(`${BASE}/puzzles/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const title2 = await page.title();
  console.log('[2] /puzzles/ → title:', title2);

  // 3. / → top (TAP TO START)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button.gate', { timeout: 5000 });
  const title3 = await page.title();
  console.log('[3] / → title:', title3);

  // 4. / TAP → puzzle-select 遷移後 URL 確認 (pushState)
  const gate = await page.$('button.gate');
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  await page.waitForTimeout(300);
  const url4 = await page.evaluate(() => window.location.pathname);
  console.log('[4] After TAP, URL =', url4, '(expected: /puzzles/)');

  // 5. ハート選択 → URL が /puzzles/5x5/heart/ になるか
  const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heart.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(300);
  const url5 = await page.evaluate(() => window.location.pathname);
  console.log('[5] After ハート click, URL =', url5, '(expected: /puzzles/5x5/heart/)');

  console.log('[step] OK');
} finally {
  await browser.close();
}
