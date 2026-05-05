// docs §14.1: エントリ。React 19 で App をマウントするのみ。
// Pixi.js Canvas は React ツリー内の <GameView> が ref 経由で初期化する (Gemini #1 申し送り対応)。

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@ui/App.tsx';

const ROOT_ID = 'app-root';

function bootstrap(): void {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`#${ROOT_ID} が見つかりません`);
    return;
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
