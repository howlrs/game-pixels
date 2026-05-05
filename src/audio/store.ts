// β2.0-β / Gemini 指摘 1: ミュート状態の同期ズレ防止のため Zustand 化。
// HUD だけでなく将来の Settings Modal などからも共通参照可能に。
//
// β11.0-α: BGM 状態 (enabled / volume) を追加。
// muted は SE と BGM 両方を黙らせる「親 mute」として機能する。

import { create } from 'zustand';
import { setMuted as synthSetMuted } from './synth.ts';
import { setBgmEnabled, setBgmMuted, setBgmVolume } from './bgm.ts';

interface AudioState {
  muted: boolean;
  bgmEnabled: boolean;
  bgmVolume: number;
  setMuted: (value: boolean) => void;
  toggleMuted: () => void;
  setBgmEnabled: (value: boolean) => void;
  setBgmVolume: (value: number) => void;
}

export const useAudio = create<AudioState>((set, get) => ({
  muted: false,
  bgmEnabled: false, // β11.0-α: デフォルト OFF (集中ゲーム / Gemini Pro 同意)
  bgmVolume: 0.5,
  setMuted: (value) => {
    synthSetMuted(value);
    setBgmMuted(value);
    set({ muted: value });
  },
  toggleMuted: () => {
    const next = !get().muted;
    synthSetMuted(next);
    setBgmMuted(next);
    set({ muted: next });
  },
  setBgmEnabled: (value) => {
    setBgmEnabled(value);
    set({ bgmEnabled: value });
  },
  setBgmVolume: (value) => {
    const clamped = Math.max(0, Math.min(1, value));
    setBgmVolume(clamped);
    set({ bgmVolume: clamped });
  },
}));
