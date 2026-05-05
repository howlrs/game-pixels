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
        name: 'マリオピクセル',
        short_name: 'マリオピクセル',
        description: 'Web 2D サイドスクロール プラットフォーマー',
        theme_color: '#000000',
        background_color: '#000000',
        // §14.10: フルスクリーン起動 (display_override の fullscreen は iOS で実質 standalone)
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        // §14.10: precache + ステージ JSON は stale-while-revalidate
        runtimeCaching: [
          {
            urlPattern: /^.*\/stages\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'stage-json' },
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
});
