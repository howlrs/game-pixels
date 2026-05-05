// β2.0-β: Zustand store を購読して、状態変化に応じて SE を再生する。
// 入力経路 (Mouse/Touch/Keyboard) によらず一元的に音を鳴らせる。
//
// 検知ロジック:
// - board.cells[i] が EMPTY → FILLED に変わった   → fill SE
// - board.cells[i] が EMPTY/FILLED → X_MARKED に変わった → mark SE
// - board.cells[i] が FILLED/X_MARKED → EMPTY に変わった → erase SE
// - phase が cleared に遷移した → clear SE (line-complete はマーク管理が複雑なので β2.0-β では省略)
//
// パフォーマンス: 1 回の subscribe コールバックで O(セル数) 走査 (15x15=225, 25x25=625)。
// 5x5 / 10x10 / 15x15 / 25x25 すべてで 60fps に余裕。

import { useGame, type AppPhase } from '@game/index.ts';
import { EMPTY, FILLED, X_MARKED, type Board, type CellState } from '@core/index.ts';
import { getAudioContext, initAudioOnUserGesture, playSe } from './synth.ts';
import { attachAudioContext, startBgm, stopBgm } from './bgm.ts';
import { useAudio } from './store.ts';

let attached: (() => void) | null = null;

export function mountAudio(): () => void {
  if (attached) return attached;

  let prevBoard: Board | null = null;
  let prevPhase: AppPhase | null = null;

  const unsub = useGame.subscribe((s) => {
    // phase 遷移を先に処理 (cleared 突入時 SE + BGM 制御)
    if (s.phase !== prevPhase) {
      if (s.phase === 'cleared') {
        playSe('clear');
      }
      // β11.0-α: BGM 連動 — playing で start, それ以外は stop
      const wantPlay = s.phase === 'playing' && useAudio.getState().bgmEnabled;
      if (wantPlay) {
        void startBgm();
      } else {
        stopBgm();
      }
      prevPhase = s.phase;
    }

    // board 変化を 1D 走査で diff
    if (prevBoard && prevBoard !== s.board) {
      const cells = s.board.cells;
      const prevCells = prevBoard.cells;
      // 単発 diff のみ検知 (典型操作はタップ 1 セル / ドラッグ 1 セル)
      // 複数セル変更時 (リセット等) は最初に見つけたものだけ鳴らす (連発音回避)
      const len = Math.min(cells.length, prevCells.length);
      for (let i = 0; i < len; i++) {
        const before = prevCells[i] ?? EMPTY;
        const after = cells[i] ?? EMPTY;
        if (before === after) continue;
        playSe(seForTransition(before, after));
        break;
      }
    }
    prevBoard = s.board;
  });

  attached = () => {
    unsub();
    attached = null;
  };
  return attached;
}

function seForTransition(before: CellState, after: CellState): 'fill' | 'mark' | 'erase' {
  if (after === FILLED) return 'fill';
  if (after === X_MARKED) return 'mark';
  if (after === EMPTY && (before === FILLED || before === X_MARKED)) return 'erase';
  return 'erase';
}

/**
 * Tap to Start などのユーザー操作時に呼んで AudioContext を確実に初期化する。
 * β11.0-α: 初期化後の AudioContext を BGM モジュールに共有 (synth と同一 ctx を使う)。
 */
export function bootAudioOnGesture(): void {
  initAudioOnUserGesture();
  const ctx = getAudioContext();
  if (ctx) attachAudioContext(ctx);
}
