// β2.0-δ smoke: HUD の歯車ボタン → SettingsModal が開閉する + slider 操作で値が反映
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

  const gear = await page.waitForSelector('.hud-icon-btn[aria-label="設定を開く"]', { timeout: 5000 });
  await gear.click();
  await page.waitForSelector('.settings-modal', { timeout: 5000 });
  console.log('[step] settings modal opened');
  await page.screenshot({ path: '/tmp/beta2d-settings-open.png', fullPage: false });

  const headerText = await page.$eval('#settings-title', (el) => el.textContent);
  const ariaModal = await page.getAttribute('.settings-modal', 'aria-modal');
  const sliderCount = (await page.$$('.settings-row input[type="range"]')).length;
  const toggleCount = (await page.$$('.settings-toggle input[type="checkbox"]')).length;
  console.log('[step] modal:', { headerText, ariaModal, sliderCount, toggleCount });

  const masterSlider = await page.$('.settings-row input[type="range"]');
  await masterSlider.evaluate((el) => {
    el.value = '30';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(100);
  const outputValue = await page.$eval('.settings-row output', (el) => el.textContent);
  console.log('[step] after slider change → output =', outputValue);

  const reduceMotionCb = (await page.$$('.settings-toggle input[type="checkbox"]'))[1];
  await reduceMotionCb.click();
  const checked = await reduceMotionCb.evaluate((el) => el.checked);
  console.log('[step] reduceMotion checked:', checked);

  const close = await page.waitForSelector('.settings-footer button.primary', { timeout: 5000 });
  await close.click();
  await page.waitForTimeout(200);
  const stillOpen = (await page.$('.settings-modal')) !== null;
  console.log('[step] after close click, modal exists:', stillOpen);

  await gear.click();
  await page.waitForSelector('.settings-modal', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const escClosed = (await page.$('.settings-modal')) === null;
  console.log('[step] Esc close worked:', escClosed);

  await page.screenshot({ path: '/tmp/beta2d-after-close.png', fullPage: false });
  console.log('[step] OK');
} finally {
  await browser.close();
}
