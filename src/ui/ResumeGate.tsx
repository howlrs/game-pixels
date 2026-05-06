// docs §92.3.2 / β7.0-β: バックグラウンド復帰時または手動 pause 時の TAP TO RESUME。
// visibility.ts の handler または HUD の ⏸ ボタンで phase='paused' に遷移し、
// このコンポーネントが表示される。タップで物理再開 (useGame.resumeTimer)。
//
// 2026-05-06: モバイル描画バグ対策で常時マウント方針に変更 (Round 7-A 拡張)。
// 親 (App.tsx) が display:none / block で見せ消えする前提のため、自身では phase 判定しない。

import { useGame } from '@game/index.ts';

export function ResumeGate() {
  const resume = useGame((s) => s.resumeTimer);
  return (
    <button
      type="button"
      className="gate"
      onPointerDown={() => {
        // ⚠ ジェスチャー内同期呼び出し (§92.3.2)
        resume();
      }}
      aria-label="ゲームを再開"
    >
      <div>
        TAP TO RESUME
        <small>タップして再開</small>
      </div>
    </button>
  );
}
