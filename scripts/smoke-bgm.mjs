// β11.0-α smoke: SettingsModal の BGM 設定が UI に出る + audio store 連動 +
// AudioContext (実環境) で startBgm 呼出後 source が生成されることを window 経由で確認
import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:5173/';

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'warning' || msg.type() === 'error') {
      console.log(`[${msg.type()}]`, msg.text());
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
  await gate.dispatchEvent('pointerdown');
  await page.waitForSelector('.puzzle-select', { timeout: 5000 });
  const heart = await page.waitForSelector('.puzzle-select button:has-text("ハート")', { timeout: 5000 });
  await heart.click();
  await page.waitForSelector('.hud', { timeout: 5000 });
  await page.waitForTimeout(400);

  // 設定モーダルを開く
  const settingsBtn = await page.$('.hud-icon-btn[aria-label="設定を開く"]');
  await settingsBtn.click();
  await page.waitForSelector('.settings-modal', { timeout: 2000 });

  // BGM トグルが存在するか確認
  const bgmToggle = await page.$('label.settings-toggle:has-text("BGM (集中向けアンビエント)") input[type="checkbox"]');
  console.log('[step] BGM トグル存在:', bgmToggle !== null);
  const bgmInitial = await bgmToggle.evaluate((el) => el.checked);
  console.log('[step] BGM 初期 OFF:', !bgmInitial, '(expected: true)');

  // BGM 音量スライダーが存在するか確認
  const bgmRange = await page.$('label.settings-row:has-text("BGM 音量") input[type="range"]');
  console.log('[step] BGM 音量スライダー存在:', bgmRange !== null);
  const rangeDisabled1 = await bgmRange.evaluate((el) => el.disabled);
  console.log('[step] BGM スライダー初期 disabled:', rangeDisabled1, '(expected: true)');

  // BGM ON
  await bgmToggle.click();
  await page.waitForTimeout(200);
  const rangeDisabled2 = await bgmRange.evaluate((el) => el.disabled);
  console.log('[step] BGM ON 後 スライダー有効化:', !rangeDisabled2, '(expected: true)');

  // 音量 30% に設定
  await bgmRange.fill('30');
  await page.waitForTimeout(200);

  // モーダルを閉じる
  const closeBtn = await page.$('.settings-close');
  await closeBtn.click();
  await page.waitForTimeout(500);

  // pageevaluate で startBgm が呼ばれているか間接確認 (window から audio store 読み出し)
  // 直接は難しいので AudioContext の active 状態を確認
  const bgmState = await page.evaluate(async () => {
    // dynamic import で bgm モジュールを取得
    // dev server なので src 直接アクセス (Vite が reactor で resolve)
    const mod = await import('/src/audio/bgm.ts');
    return mod._getBgmState();
  });
  console.log('[step] BGM state from page:', JSON.stringify(bgmState));
  console.log('[step] enabled:', bgmState.enabled, '(expected: true)');
  console.log('[step] isPlaying:', bgmState.isPlaying, '(expected: true if AudioContext available)');
  console.log('[step] volume:', bgmState.volume, '(expected: 0.3)');

  await page.screenshot({ path: '/tmp/beta11a-bgm-on.png', fullPage: false });

  console.log('[step] OK — see /tmp/beta11a-bgm-on.png');
} finally {
  await browser.close();
}
