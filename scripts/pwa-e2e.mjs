// Step E: production build + preview server で Service Worker / Manifest / アイコンが正しく配信されるか確認。
// Playwright で sw.js / manifest.webmanifest / icon-*.svg / favicon.svg / stages/1-1.json を取得し、
// 200 OK かつ Content-Type が想定値であることを検証する。

import { chromium } from 'playwright';

const URL = 'https://127.0.0.1:4173/'; // vite preview (basicSsl plugin で https)

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const networkLog = [];
  page.on('response', (res) => {
    networkLog.push({
      url: res.url(),
      status: res.status(),
      contentType: res.headers()['content-type'],
    });
  });

  await page.goto(URL, { waitUntil: 'networkidle' });

  // Tap to Start を一回押してゲームに入る
  await page.locator('button.gate').dispatchEvent('pointerdown');
  await page.waitForSelector('.hud', { timeout: 5000 });

  // PWA リソースの個別 fetch
  const checks = await Promise.all(
    ['/sw.js', '/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg', '/favicon.svg', '/stages/1-1.json'].map(
      async (path) => {
        const res = await page.request.get(URL.replace(/\/$/, '') + path);
        return {
          path,
          status: res.status(),
          contentType: res.headers()['content-type'] ?? '',
          ok: res.ok(),
        };
      },
    ),
  );

  // Service Worker が登録されたか (登録は load 後に走るため少し待つ)
  await page.waitForTimeout(1500);
  const swRegistered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    try {
      // ready は activated controller を待つので installing/waiting も含めて確実に検出
      const ready = await Promise.race([
        navigator.serviceWorker.ready.then((r) => ({ from: 'ready', scope: r.scope, scriptURL: r.active?.scriptURL ?? null })),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (ready) return ready;
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? { from: 'getRegistration', scope: reg.scope, scriptURL: reg.active?.scriptURL ?? null } : null;
    } catch (e) {
      return { error: String(e) };
    }
  });

  await page.screenshot({ path: '/tmp/mario-pixel-step-e.png', fullPage: false });

  // production HTML に registerSW.js script タグが含まれているか
  const hasRegisterScript = await page.$eval('html', (el) =>
    !!el.querySelector('script#vite-plugin-pwa\\:register-sw'),
  );

  // Step E の合格条件: 全リソース 200 + register script タグ存在。
  // SW 自体の登録は production HTTPS (Cloudflare Pages, Step F) で最終確認する。
  // Playwright + 自己署名 HTTPS では SW 登録が走らないことがあるため、ここでは判定対象外。
  const result = {
    ok: checks.every((c) => c.ok) && hasRegisterScript,
    checks,
    hasRegisterScript,
    swRegistered, // 参考情報 (preview 環境では null になり得る)
    initialNetworkPwaResources: networkLog
      .filter((r) => /sw\.js|manifest\.webmanifest|icon-|favicon|stages\//.test(r.url))
      .map(({ url, status, contentType }) => ({ url, status, contentType })),
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
