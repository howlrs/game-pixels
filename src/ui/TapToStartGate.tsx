// docs §92.3.1: Tap to Start で AudioContext unlock (将来) + ゲーム本体起動。
// 同期実行の制約は本コンポーネントの onPointerDown 内で守る。
// 本 PR では React 統合 + DOM 分離が主目的のため、AudioContext 実装は次フェーズ。

import { useHud } from './hud-store.ts';

interface Props {
  onStart: () => void; // ジェスチャー内で同期実行されるコールバック (await 禁止)
  message?: string;
  hint?: string;
}

export function TapToStartGate({
  onStart,
  message = 'TAP TO START',
  hint = 'ピクセルズ — Web ピクチャーロジック',
}: Props) {
  return (
    <button
      type="button"
      className="gate"
      onPointerDown={() => {
        // ⚠ ここで await を挟むと iOS Safari で AudioContext unlock 失敗 (§12.3.1)
        onStart();
        useHud.getState().setPhase('playing');
      }}
    >
      <div>
        {message}
        <small>{hint}</small>
      </div>
    </button>
  );
}
