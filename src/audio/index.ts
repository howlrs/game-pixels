// docs §14.1 audio/: 音声レイヤ。
// β2.0-β: WebAudio 簡易シンセ (synth.ts) を採用 (音声ファイル不要、軽量、PWA bundle 軽量化)。
// Howler 依存は将来の本格 BGM 実装で利用予定 (現在は package.json に残置)。

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
