// docs §90.6.1: モード切替ボタン (タッチデバイス用、PC でも使える)。
// WCAG 44×44px 以上 (§97)。現在モードを aria-pressed で示す。

import { useGame, type InputMode } from '@game/index.ts';

const MODES: { mode: InputMode; label: string; icon: string }[] = [
  { mode: 'fill', label: '塗', icon: '■' },
  { mode: 'mark-x', label: '×', icon: '×' },
  { mode: 'erase', label: '消', icon: '□' },
];

export function ModeButtons() {
  const phase = useGame((s) => s.phase);
  const mode = useGame((s) => s.mode);
  const setMode = useGame((s) => s.setMode);

  if (phase !== 'playing' && phase !== 'paused') return null;

  return (
    <div className="mode-buttons" role="group" aria-label="入力モード">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          aria-pressed={mode === m.mode}
          aria-label={m.label}
          onClick={() => setMode(m.mode)}
          className={mode === m.mode ? 'mode-btn active' : 'mode-btn'}
        >
          <span aria-hidden="true">{m.icon}</span>
        </button>
      ))}
    </div>
  );
}
