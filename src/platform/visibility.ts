// docs §92.3.2: visibilitychange で suspend のみ実行。
// resume は「TAP TO RESUME」のタップハンドラ内で同期実行 (Round 3 / Gemini Pro 指摘)。
//
// β7.0-β: 旧 useHud (Round 5 残骸) 参照を useGame に修正。
// playing → paused の自動遷移を実 store で行う。

import { useGame } from '@game/index.ts';

/**
 * visibilitychange ハンドラを登録し、解除関数を返す。
 * React の useEffect cleanup で必ず解除し、リスナーリークを防ぐ (Step A / Gemini Pro 指摘)。
 */
export function mountVisibilityHandler(): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => {
    if (document.hidden) {
      // バックグラウンド移行: ゲームを paused 状態に。playing 中のみ。
      const phase = useGame.getState().phase;
      if (phase === 'playing') {
        useGame.getState().pauseTimer();
      }
      console.info('[visibility] hidden — pause requested');
    } else {
      // フォアグラウンド復帰: ここでは何もしない (resume は ResumeGate のハンドラ経由)。
      console.info('[visibility] visible — awaiting Tap to Resume');
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
