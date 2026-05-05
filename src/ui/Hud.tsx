// docs §14.2.2 / §17.10: HUD は React コンポーネント、Zustand store から読み取り。
// 物理 frame 終了時に Vanilla 側から store に Push されるため、ここは購読のみ。

import { useHud } from './hud-store.ts';

export function Hud() {
  const score = useHud((s) => s.score);
  const coins = useHud((s) => s.coins);
  const lives = useHud((s) => s.lives);
  const timer = useHud((s) => s.timer);
  const fps = useHud((s) => s.fps);

  return (
    <div className="hud" role="status" aria-live="polite">
      <span>SCORE {score.toString().padStart(6, '0')}</span>
      <span>COIN ×{coins.toString().padStart(2, '0')}</span>
      <span>LIFE ×{lives}</span>
      <span>TIME {timer.toString().padStart(3, '0')}</span>
      <span>FPS {fps.toFixed(0)}</span>
    </div>
  );
}
