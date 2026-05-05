// docs §14.1 audio/: 音声レイヤ。
// β2.0-β: WebAudio 簡易シンセ (synth.ts) を採用 (音声ファイル不要、軽量、PWA bundle 軽量化)。
// β11.0-α: BGM も WebAudio 自前合成で実装 (bgm.ts)。Howler 依存は package.json に残置だが未使用。

export {
  initAudioOnUserGesture,
  isMuted,
  playSe,
  setMuted,
  setVolume,
  type SeName,
} from './synth.ts';
export { bootAudioOnGesture, mountAudio } from './mount.ts';
export { useAudio } from './store.ts';
export {
  attachAudioContext,
  setBgmEnabled,
  setBgmMaster,
  setBgmMuted,
  setBgmVolume,
  startBgm,
  stopBgm,
} from './bgm.ts';
