// docs §92.3.1: Tap to Start で AudioContext unlock + ゲーム本体起動。
// 同期実行の制約は本コンポーネントの onPointerDown 内で守る。
// β2.0-β: bootAudioOnGesture で実 AudioContext を初期化 (autoplay policy 対応)。
// β8.0-α: 旧 useHud (Round 5 残骸) 参照を削除、phase 遷移は親 onStart に一元化。

import { bootAudioOnGesture } from '@audio/index.ts';

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
      }}
    >
      <div>
        {message}
        <small>{hint}</small>
      </div>
    </button>
  );
}
