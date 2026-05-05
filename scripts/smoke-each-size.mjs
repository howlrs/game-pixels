// Round 7-E: 各サイズの代表 puzzle を 1 つずつロードして board screenshot を取る
import { chromium } from 'playwright';
const URL = 'https://127.0.0.1:5173/';

const TARGETS = [
  { size: '5x5', title: 'ハート', shot: '/tmp/round7e-board-5x5.png' },
  { size: '10x10', title: 'ねこ', shot: '/tmp/round7e-board-10x10.png' },
  { size: '15x15', title: 'うさぎ', shot: '/tmp/round7e-board-15x15.png' },
  { size: '25x25', title: 'ちょう', shot: '/tmp/round7e-board-25x25.png' },
];

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
try {
  for (const t of TARGETS) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    const gate = await page.waitForSelector('button.gate', { timeout: 5000 });
    await gate.dispatchEvent('pointerdown');
    await page.waitForSelector('.puzzle-select', { timeout: 5000 });
    const btn = await page.waitForSelector(`.puzzle-select button:has-text("${t.title}")`, { timeout: 5000 });
    await btn.click();
    await page.waitForSelector('.hud', { timeout: 5000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: t.shot, fullPage: false });
    console.log(`${t.size} (${t.title}) -> ${t.shot}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
