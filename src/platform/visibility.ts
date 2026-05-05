// docs §92.3.2: visibilitychange で suspend のみ実行。
// resume は「TAP TO RESUME」のタップハンドラ内で同期実行 (Round 3 / Gemini Pro 指摘)。

import { useHud } from '@ui/hud-store.ts';

/**
 * visibilitychange ハンドラを登録し、解除関数を返す。
 * React の useEffect cleanup で必ず解除し、リスナーリークを防ぐ (Step A / Gemini Pro 指摘)。
 */
export function mountVisibilityHandler(): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => {
    if (document.hidden) {
      // バックグラウンド移行: ゲームを paused 状態に。実 audioContext.suspend() / Howler.mute(true) は次フェーズ。
      const phase = useHud.getState().phase;
      if (phase === 'playing') {
        useHud.getState().setPhase('paused');
      }
      console.info('[visibility] hidden — pause requested');
    } else {
      // フォアグラウンド復帰: ここでは何もしない (resume は TAP TO RESUME のハンドラ経由)。
      console.info('[visibility] visible — awaiting Tap to Resume');
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
