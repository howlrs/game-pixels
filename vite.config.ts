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
        name: 'ピクセルズ',
        short_name: 'ピクセルズ',
        description: 'Web ピクチャーロジック (ノノグラム)',
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
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        // §14.10: precache + パズル JSON は stale-while-revalidate (旧 stage-json から rename)
        runtimeCaching: [
          {
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
