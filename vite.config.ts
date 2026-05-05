import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// docs/94_architecture.md §14.9 / §14.10 準拠
export default defineConfig({
  plugins: [
    react(),
    // Gamepad API は secure context (https) 必須 (§9.6.3)
    basicSsl(),
    // PWA: Service Worker のみ。Push/Sync は不採用 (§14.10 / §18.12)
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'ピクセルズ - Web ノノグラム / ピクチャーロジック',
        short_name: 'ピクセルズ',
        // β11.2 SEO: 短い説明では検索/インストールバナーで訴求不足。長文 description で機能を網羅。
        description:
          '行と列のヒント数字から塗るマスを論理だけで導く Web ノノグラム / ピクチャーロジック。5×5〜25×25 の 21 パズルすべて推測なしで解ける一意解 (CI 強制)。Undo/Redo、ズーム+パン、PWA でオフライン対応。広告・課金・登録ゼロ。',
        lang: 'ja',
        categories: ['games', 'puzzle', 'entertainment'],
        theme_color: '#000000',
        background_color: '#000000',
        // §14.10: フルスクリーン起動 (display_override の fullscreen は iOS で実質 standalone)
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        start_url: '/',
        scope: '/',
        // SVG アイコン 1 種で density 不問にカバー (Step E MVP)。PNG 派生は将来追加。
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        // β11.2 SEO: PWA インストール時のスクリーンショットプレビュー (Chrome / Edge 対応)
        screenshots: [
          {
            src: '/og-image.png',
            sizes: '1200x630',
            type: 'image/png',
            form_factor: 'wide',
            label: 'うさぎパズル完成例 - 15x15 ノノグラム',
          },
        ],
      },
      workbox: {
        // β12.0-α SSG: vite build 時点では index.html (top) しか precache 対象に無い。
        // 27 個の SSG HTML は build:ssg ステップで後から生成される。
        // 一方、SW は precache 済 index.html を navigation fallback として返してしまうため、
        // /puzzles/<cat>/<id>/ をリロードすると top の HTML (= __PIXELS_INITIAL_PATH__ = "/")
        // が返り TAP TO START が表示される問題が発生していた (β12.0-β で修正したクライアントロジックが
        // SW で潰される)。
        //
        // Gemini Pro deep 推奨案 A: navigateFallback を無効化 + navigation request は NetworkFirst で
        // 実 HTML を取得、オフライン時は訪問済キャッシュから返す。
        // - SEO 影響: ボットは SW を bypass するので皆無
        // - オフライン: 訪問済ページのみ表示、未訪問は network error (案 B のように全 prerender 同梱は
        //   将来パズル数が増えたときに precache 肥大化するため不採用)
        globPatterns: ['**/*.{js,css,svg,png,ico,webp,woff2}'],
        // β12.0.2: HTML を precache から外し navigation 専用ランタイムキャッシュへ
        navigateFallback: null,
        // Navigation Preload: SW 起動中の並行通信で高速化 (Safari 16+ 対応、未対応は graceful degrade)
        navigationPreload: true,
        runtimeCaching: [
          {
            // navigation request (HTML) は NetworkFirst で常に新鮮な HTML を取得
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // パズル JSON は SWR (頻繁な変更なし、即時表示優先)
            urlPattern: /^.*\/puzzles\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'puzzle-json' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@game': resolve(__dirname, 'src/game'),
      '@render': resolve(__dirname, 'src/render'),
      '@audio': resolve(__dirname, 'src/audio'),
      '@input': resolve(__dirname, 'src/input'),
      '@save': resolve(__dirname, 'src/save'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@platform': resolve(__dirname, 'src/platform'),
      '@qa': resolve(__dirname, 'src/qa'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // basicSsl plugin が証明書を提供するので https: true は不要 (plugin が enable する)
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  // React 19 は ESM だが、依存パッケージ (zustand 等) が CJS 経由で require する場合に
  // 二重実体化することがある (Invalid hook call)。React/ReactDOM/Zustand を pre-bundle で
  // 統一し、CJS interop による別インスタンス化を防ぐ。
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'zustand'],
  },
});
