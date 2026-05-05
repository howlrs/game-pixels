// docs §9.3 / §14.4: 入力スナップショット境界。frame 開始時に raw な press 状態から
// InputSnapshot を生成し、frame 内で値が変わらないようロックする。
// SOCD 解消は §2.2.5 の "後押し優先 (last input wins)" を採用。

import type { InputSnapshot, ButtonState } from './snapshot.ts';
import { NEUTRAL, deriveButtonState } from './snapshot.ts';

export type LogicalKey = 'left' | 'right' | 'up' | 'down' | 'jump' | 'run' | 'pause';

export interface InputBuffer {
  /** 現フレームの InputSnapshot を取得 (frame 開始後に呼ぶ)。 */
  snapshot(): InputSnapshot;
  /** 物理 frame の開始時に必ず呼ぶ。raw な press → InputSnapshot を生成。 */
  beginFrame(): void;
  /** 外部 (Keyboard/Pointer/Gamepad) から press 状態を更新する。 */
  setKey(key: LogicalKey, pressed: boolean): void;
  /** 後押し優先 (last input wins) のための「最後に押されたタイミング」記録 (§2.2.5)。 */
  markLastInputAt(key: 'left' | 'right' | 'up' | 'down', timestampMs: number): void;
  /** 全状態をリセット (Pause / フォーカス喪失で呼ぶ)。 */
  reset(): void;
}

interface InternalState {
  pressed: Record<LogicalKey, boolean>;
  /**
   * "そのフレームで 1 度でも押されたか" を記録する Latch (Step C / Gemini Pro 指摘で追加)。
   * 1 frame 未満のタップ (押す → 離す が 16ms 以内に発生) でも入力を取りこぼさない。
   * beginFrame の中で評価して、その後 false にリセットする。
   */
  pressedLatch: Record<LogicalKey, boolean>;
  lastAxisInputAt: { left: number; right: number; up: number; down: number };
  current: InputSnapshot;
  prevButtons: { jump: ButtonState; run: ButtonState; pause: ButtonState };
}

function freshState(): InternalState {
  return {
    pressed: { left: false, right: false, up: false, down: false, jump: false, run: false, pause: false },
    pressedLatch: { left: false, right: false, up: false, down: false, jump: false, run: false, pause: false },
    lastAxisInputAt: { left: 0, right: 0, up: 0, down: 0 },
    current: { ...NEUTRAL },
    prevButtons: { jump: 'up', run: 'up', pause: 'up' },
  };
}

export function createInputBuffer(): InputBuffer {
  const s = freshState();

  function resolveAxis(neg: 'left' | 'up', pos: 'right' | 'down'): -1 | 0 | 1 {
    // Latch も含めて「このフレームで押された痕跡があるか」で判定する (Step C / Gemini Pro 指摘)
    const negPressed = s.pressed[neg] || s.pressedLatch[neg];
    const posPressed = s.pressed[pos] || s.pressedLatch[pos];
    if (negPressed && posPressed) {
      // 後押し優先 (§2.2.5)
      return s.lastAxisInputAt[pos] >= s.lastAxisInputAt[neg] ? 1 : -1;
    }
    if (negPressed) return -1;
    if (posPressed) return 1;
    return 0;
  }

  /** Latch を含めて「このフレームで押されたか」を返す。 */
  function wasPressedThisFrame(key: LogicalKey): boolean {
    return s.pressed[key] || s.pressedLatch[key];
  }

  return {
    snapshot: () => s.current,
    beginFrame: () => {
      const ax = resolveAxis('left', 'right');
      const ay = resolveAxis('up', 'down');
      const jump = deriveButtonState(s.prevButtons.jump, wasPressedThisFrame('jump'));
      const run = deriveButtonState(s.prevButtons.run, wasPressedThisFrame('run'));
      const pause = deriveButtonState(s.prevButtons.pause, wasPressedThisFrame('pause'));
      s.current = { ax, ay, jump, run, pause };
      s.prevButtons = { jump, run, pause };
      // Latch をクリア。次フレーム用にまた raw から積み直す。
      s.pressedLatch = { left: false, right: false, up: false, down: false, jump: false, run: false, pause: false };
    },
    setKey: (key, pressed) => {
      s.pressed[key] = pressed;
      // 押された瞬間を Latch に立てる (1 frame 未満のタップを取りこぼさないため)
      if (pressed) s.pressedLatch[key] = true;
    },
    markLastInputAt: (key, ts) => {
      s.lastAxisInputAt[key] = ts;
    },
    reset: () => {
      const fresh = freshState();
      s.pressed = fresh.pressed;
      s.pressedLatch = fresh.pressedLatch;
      s.lastAxisInputAt = fresh.lastAxisInputAt;
      s.current = fresh.current;
      s.prevButtons = fresh.prevButtons;
    },
  };
}
