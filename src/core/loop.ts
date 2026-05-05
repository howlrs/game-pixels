// docs §94.3: 固定タイムステップ (60Hz) のゲームループ accumulator 実装。
// rAF と物理を完全分離し、performance.now() のデルタを蓄積して 1/60s ごとに physicsStep を呼ぶ。
// ProMotion (120Hz / 144Hz) でも物理が 60Hz 維持される (§17.14 H で事前回避済 = §95.9 の罠カタログ)。

export const PHYSICS_HZ = 60;
export const PHYSICS_DT_MS = 1000 / PHYSICS_HZ;
export const MAX_FRAME_MS = 250; // spiral of death 防止 (Gaffer on Games)

export interface FixedStepLoopConfig {
  /** 物理ステップ。dt は秒単位 (1/60 = 0.0166...)。 */
  physicsStep: (dtSec: number) => void;
  /** 描画ステップ。alpha = accumulator / dt の補間係数を渡す。 */
  render: (alpha: number) => void;
  /** 1 frame で消化する最大物理ステップ数 (デフォルト 5)。 */
  maxStepsPerFrame?: number;
}

export interface FixedStepLoopHandle {
  /** 1 フレーム進める。引数の elapsedMs は前回 onFrame との実時間差 (ms)。 */
  onFrame: (elapsedMs: number) => void;
  /** 内部 accumulator を 0 に戻す (Pause / Resume 復帰時に使う)。 */
  reset: () => void;
  /** 直近の状態を取得 (テスト用 / デバッグ用)。 */
  state: () => { accumulatorMs: number; lastSteps: number; totalSteps: number };
}

export function createFixedStepLoop(config: FixedStepLoopConfig): FixedStepLoopHandle {
  const dtMs = PHYSICS_DT_MS;
  const dtSec = dtMs / 1000;
  const maxSteps = config.maxStepsPerFrame ?? 5;
  let accumulatorMs = 0;
  let lastSteps = 0;
  let totalSteps = 0;

  return {
    onFrame: (elapsedMs: number) => {
      // 異常値 (タブ復帰直後等) は MAX_FRAME_MS にクリップ
      const clamped = Math.min(elapsedMs, MAX_FRAME_MS);
      accumulatorMs += clamped;
      lastSteps = 0;
      while (accumulatorMs >= dtMs && lastSteps < maxSteps) {
        config.physicsStep(dtSec);
        accumulatorMs -= dtMs;
        lastSteps += 1;
        totalSteps += 1;
      }
      // maxSteps を使い切ったら残りの accumulator は捨てる (spiral of death の最終防衛)
      if (lastSteps >= maxSteps && accumulatorMs >= dtMs) {
        accumulatorMs = 0;
      }
      const alpha = accumulatorMs / dtMs;
      config.render(alpha);
    },
    reset: () => {
      accumulatorMs = 0;
      lastSteps = 0;
    },
    state: () => ({ accumulatorMs, lastSteps, totalSteps }),
  };
}
