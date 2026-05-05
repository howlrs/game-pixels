// docs §90.2 / §90.3: 入力スナップショット (1 frame の論理ボタン状態)。

export type ButtonState = 'up' | 'pressed' | 'held' | 'released';

export interface InputSnapshot {
  /** 横入力 -1=左 / 0=なし / 1=右 (§90.3) */
  ax: -1 | 0 | 1;
  /** 縦入力 -1=上 / 0=なし / 1=下 */
  ay: -1 | 0 | 1;
  jump: ButtonState;
  run: ButtonState;
  pause: ButtonState;
}

export const NEUTRAL: InputSnapshot = {
  ax: 0,
  ay: 0,
  jump: 'up',
  run: 'up',
  pause: 'up',
};

/** 旧スナップショットと現フレームの press 状態から ButtonState を導出する。 */
export function deriveButtonState(prev: ButtonState, currentlyPressed: boolean): ButtonState {
  if (currentlyPressed) {
    if (prev === 'up' || prev === 'released') return 'pressed';
    return 'held';
  }
  if (prev === 'pressed' || prev === 'held') return 'released';
  return 'up';
}
