// β4.0-β: ハイコントラスト設定を body 属性で制御。reduceMotion と並列の構造。
//
// - CSS は body[data-high-contrast="true"] セレクタで配色オーバーライド
// - Pixi.js の色定数は getPalette() で動的切替 (mount.ts から body 属性を購読)
// - LocalStorage 永続 (UserSettings.a11y.highContrast)

export function updateHighContrast(value: boolean): void {
  if (typeof document === 'undefined') return;
  if (value) {
    document.body.dataset.highContrast = 'true';
  } else {
    delete document.body.dataset.highContrast;
  }
}

export function isHighContrastApplied(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body.dataset.highContrast === 'true';
}
