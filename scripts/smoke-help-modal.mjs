// β4.0-α smoke: HelpModal の開閉 (HUD ボタン / ? キー) + 内容表示
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

  // HUD の「?」ボタンクリック
  const helpBtn = await page.waitForSelector('.hud-icon-btn[aria-label="ヘルプを開く"]', { timeout: 5000 });
  await helpBtn.click();
  await page.waitForSelector('.help-modal', { timeout: 5000 });
  console.log('[step] HelpModal opened by button');
  await page.screenshot({ path: '/tmp/beta4a-help-open.png', fullPage: false });

  // 内容確認
  const headerText = await page.$eval('#help-title', (el) => el.textContent);
  const sectionCount = (await page.$$('.help-modal .help-section')).length;
  const rowCount = (await page.$$('.help-row')).length;
  const ariaModal = await page.getAttribute('.help-modal', 'aria-modal');
  console.log('[step] modal:', { headerText, sectionCount, rowCount, ariaModal });

  // Esc で閉じる
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const closedAfterEsc = (await page.$('.help-modal')) === null;
  console.log('[step] Esc closed:', closedAfterEsc);

  // ? キーで再度開く (グローバルリスナー検証)
  await page.keyboard.press('?');
  await page.waitForTimeout(200);
  const openedByKey = (await page.$('.help-modal')) !== null;
  console.log('[step] ? key opened:', openedByKey);

  // ? キーで閉じる (toggle)
  await page.keyboard.press('?');
  await page.waitForTimeout(200);
  const closedByKey = (await page.$('.help-modal')) === null;
  console.log('[step] ? key toggled close:', closedByKey);

  console.log('[step] OK');
} finally {
  await browser.close();
}
