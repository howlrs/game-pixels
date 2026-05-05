// docs §9.4 Keyboard: keydown / keyup を InputBuffer に流す。
// event.code を使用 (キーボード配列に依存しない)。
// window.blur で全キー解放 (フォーカス喪失で stuck key 防止)。

import type { InputBuffer, LogicalKey } from '@core/input/buffer.ts';

const KEY_MAP: Readonly<Record<string, LogicalKey>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyK: 'jump',
  KeyZ: 'jump',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyJ: 'run',
  KeyX: 'run',
  Escape: 'pause',
  Enter: 'pause',
};

/**
 * Keyboard イベントを InputBuffer に橋渡しする。
 * 戻り値の cleanup() を必ず呼んで listener を解除すること (Step A の visibility と同じ規律)。
 */
export function attachKeyboard(buffer: InputBuffer, target: Window | HTMLElement = window): () => void {
  const onKeyDown = (e: Event) => {
    const ke = e as KeyboardEvent;
    const key = KEY_MAP[ke.code];
    if (!key) return;
    if (key === 'left' || key === 'right' || key === 'up' || key === 'down') {
      buffer.markLastInputAt(key, performance.now());
    }
    buffer.setKey(key, true);
    // ゲームに使うキーはブラウザ既定 (スクロール等) を抑止。
    // ただし <input> / <textarea> / <button> 等の UI 要素にフォーカスがある場合は preventDefault しない
    // (Step C / Gemini Pro 指摘: 設定画面のキーボード操作を阻害しないため)。
    const target = ke.target as Element | null;
    const tag = target?.tagName;
    const isFormInput =
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (isFormInput) return;
    if (
      ke.code === 'Space' ||
      ke.code === 'ArrowUp' ||
      ke.code === 'ArrowDown' ||
      ke.code === 'ArrowLeft' ||
      ke.code === 'ArrowRight'
    ) {
      ke.preventDefault();
    }
  };
  const onKeyUp = (e: Event) => {
    const ke = e as KeyboardEvent;
    const key = KEY_MAP[ke.code];
    if (!key) return;
    buffer.setKey(key, false);
  };
  const onBlur = () => buffer.reset();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
