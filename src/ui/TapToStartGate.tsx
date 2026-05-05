// docs §92.3.1: Tap to Start で AudioContext unlock + ゲーム本体起動。
// 同期実行の制約は本コンポーネントの onPointerDown 内で守る。
// β2.0-β: bootAudioOnGesture で実 AudioContext を初期化 (autoplay policy 対応)。

import { bootAudioOnGesture } from '@audio/index.ts';
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
        bootAudioOnGesture();
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
