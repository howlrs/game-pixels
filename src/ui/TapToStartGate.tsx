// docs §92.3.1: Tap to Start で AudioContext unlock + ゲーム本体起動。
// 同期実行の制約は本コンポーネントの onPointerDown 内で守る。
// β2.0-β: bootAudioOnGesture で実 AudioContext を初期化 (autoplay policy 対応)。
// β8.0-α: 旧 useHud (Round 5 残骸) 参照を削除、phase 遷移は親 onStart に一元化。
//
// 2026-05-06: モバイル描画バグ対策で常時マウント方針に変更 (Round 7-A 拡張)。
// 親 (App.tsx) が display:none / block で見せ消えする前提のため本コンポーネントは
// 自身の表示判定を行わない。ボタン中身だけ返す。

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
