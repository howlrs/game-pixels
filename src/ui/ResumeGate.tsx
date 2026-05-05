// docs §92.3.2: バックグラウンド復帰時の TAP TO RESUME。
// visibilitychange ハンドラ (src/platform/visibility.ts) で phase='paused' に遷移し、
// このコンポーネントが表示される。タップで AudioContext.resume() (将来) + 物理再開。

import { useHud } from './hud-store.ts';

interface Props {
  onResume: () => void;
}

export function ResumeGate({ onResume }: Props) {
  return (
    <button
      type="button"
      className="gate"
      onPointerDown={() => {
        // ⚠ ジェスチャー内同期呼び出し (§92.3.2)
        onResume();
        useHud.getState().setPhase('playing');
      }}
    >
      <div>
        TAP TO RESUME
        <small>音と入力を再開します</small>
      </div>
    </button>
  );
}
