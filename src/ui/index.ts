// docs §14.1 ui/: メニュー, HUD, 設定, ローディング (React + Zustand, DOM ベース)。

export { App } from './App.tsx';
export { GameView } from './GameView.tsx';
export { Hud } from './Hud.tsx';
export { TapToStartGate } from './TapToStartGate.tsx';
export { ResumeGate } from './ResumeGate.tsx';
export { useHud } from './hud-store.ts';
export type { AppPhase, HudState } from './hud-store.ts';
