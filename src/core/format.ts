// docs §14.1 core/: 純粋なフォーマッタ (DOM 非依存)。
// β7.0-α: 複数 UI で重複していた formatTime を共通化 (Gemini Pro β6.0-β 指摘 ②)。

/**
 * ミリ秒を MM:SS 形式の文字列に変換 (タイマー / ベストタイム表示用)。
 * 60 分以上の場合も MM が 2 桁を超えて伸びる (例: 90 分 = "90:00")。
 *
 * @example
 *   formatTime(0)       // "00:00"
 *   formatTime(65000)   // "01:05"
 *   formatTime(3600000) // "60:00"
 */
export function formatTime(ms: number): string {
  // 負値・NaN・Infinity は 0 として扱う (UI 側で例外を投げないよう堅牢に)
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
