// β7.0-β smoke: ⏸ ボタンで paused → ResumeGate 表示 → タップで playing 復帰
import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heart.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(400);

  const pauseBtn = await page.waitForSelector('.hud-icon-btn[aria-label="一時停止"]', { timeout: 5000 });
  await pauseBtn.click();
  await page.waitForSelector('.gate', { timeout: 3000 });
  console.log('[step] paused → ResumeGate shown');
  const gateText = await page.$eval('.gate', (el) => el.textContent);
  console.log('[step] gate text:', gateText);
  await page.screenshot({ path: '/tmp/beta7b-paused.png', fullPage: false });

  const resumeBtn = await page.$('button.gate');
  await resumeBtn.dispatchEvent('pointerdown');
  await page.waitForTimeout(300);
  const stillPaused = (await page.$('button.gate')) !== null;
  const hudVisible = (await page.$('.hud-stats')) !== null;
  console.log('[step] after resume — gate gone:', !stillPaused, '/ HUD visible:', hudVisible);

  // visibilitychange で自動 paused
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  const afterHidden = await page.evaluate(() => document.querySelector('button.gate') !== null);
  console.log('[step] after visibility hidden — ResumeGate shown:', afterHidden);

  console.log('[step] OK');
} finally {
  await browser.close();
}
