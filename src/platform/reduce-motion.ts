// β3.0-β: ユーザー設定 (a11y.reduceMotion) を body[data-reduce-motion] 属性に反映する。
// CSS / JS 双方からこの属性を見てアニメ制御を分岐する設計。
//
// - 起動時: applyReduceMotionFromSettings() で初期反映
// - 設定変更時: updateReduceMotion(value) で即時反映
// - prefers-reduced-motion (OS) は別系統 (CSS の @media + grid.ts の matchMedia) で
//   独立に有効。両者が「OR」で動く。

export function updateReduceMotion(value: boolean): void {
  if (typeof document === 'undefined') return;
  if (value) {
    document.body.dataset.reduceMotion = 'true';
  } else {
    delete document.body.dataset.reduceMotion;
  }
}

/** 現在の body 属性値を読む (テスト用) */
export function isReduceMotionApplied(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.dataset.reduceMotion === 'true';
}
