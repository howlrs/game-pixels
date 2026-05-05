// docs §14.2.2: コア Vanilla + UI Zustand のハイブリッド状態管理。
// HUD の数値はゲームループの frame 終了時に Vanilla → Zustand へ Push される。
// React コンポーネント側は Zustand のフックで購読し、変更があった部分だけ再レンダリングする。

import { create } from 'zustand';

export type AppPhase = 'tap-to-start' | 'playing' | 'paused';

export interface HudState {
  phase: AppPhase;
  score: number;
  coins: number;
  lives: number;
  timer: number;
  rendererType: string;
  // 計測用
  fps: number;
}

interface HudActions {
  setPhase: (phase: AppPhase) => void;
  setFrameSnapshot: (snapshot: Partial<Omit<HudState, 'phase'>>) => void;
  reset: () => void;
}

const INITIAL: HudState = {
  phase: 'tap-to-start',
  score: 0,
  coins: 0,
  lives: 3,
  timer: 400,
  rendererType: 'unknown',
  fps: 0,
};

export const useHud = create<HudState & HudActions>((set) => ({
  ...INITIAL,
  setPhase: (phase) => set({ phase }),
  setFrameSnapshot: (snapshot) => set(snapshot),
  reset: () => set(INITIAL),
}));
