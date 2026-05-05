// β2.0-β / Gemini 指摘 1: ミュート状態の同期ズレ防止のため Zustand 化。
// HUD だけでなく将来の Settings Modal などからも共通参照可能に。

import { create } from 'zustand';
import { setMuted as synthSetMuted } from './synth.ts';

interface AudioState {
  muted: boolean;
  setMuted: (value: boolean) => void;
  toggleMuted: () => void;
}

export const useAudio = create<AudioState>((set, get) => ({
  muted: false,
  setMuted: (value) => {
    synthSetMuted(value);
    set({ muted: value });
  },
  toggleMuted: () => {
    const next = !get().muted;
    synthSetMuted(next);
    set({ muted: next });
  },
}));
