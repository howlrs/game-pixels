// docs §11.2.3 / §17.14: モバイル判定 (UA ベース、簡易)。
// 厳密な判定は実装フェーズで feature detection に置き換え予定。

export type DeviceClass = 'ios-safari' | 'android-chrome' | 'desktop';

export function detectMobile(): DeviceClass {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios-safari';
  if (/Android/.test(ua)) return 'android-chrome';
  return 'desktop';
}

export function isProMotionLikely(): boolean {
  // ProMotion 端末は rAF が 120Hz 発火 (§17.14 H)。
  // 物理は §94.3 で fixed time step で対応済のため、本判定は監視・テレメトリ用途のみ。
  //
  // ⚠ 重要な制限 (Round 3 / 実装スケルトン Gemini Pro 指摘):
  //   `screen.refreshRate` は WICG Proposal の非標準 API で **Chromium 系のみ実装** されている。
  //   iOS Safari / Firefox では undefined を返すため、本関数は常に false を返す。
  //   iOS Safari の ProMotion (iPhone 13 Pro 以降) を厳密に判定する必要が出てきた場合は、
  //   rAF の発火間隔を数フレーム計測する fallback (例: 直近 10 フレームの dt 平均が 10ms 未満)
  //   を実装すること。本作の物理は §94.3 fixed time step で 120Hz でも安全に動作するため、
  //   現状 (実装スケルトン段階) ではこの簡易判定で十分。
  if (typeof window === 'undefined') return false;
  const rate = (window.screen as Screen & { refreshRate?: number }).refreshRate;
  return typeof rate === 'number' && rate > 60;
}
