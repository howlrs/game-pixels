// Round 7-C QA 機構: 盤面ソルバー (hybrid: line solver + bounded backtrack)。
//
// アプローチ (Gemini Pro deep 指摘 C-1):
// 1. 全行・全列に line solver を反復適用 → 進展しなくなるまで
// 2. すべて確定したら 1 解確定 (continued backtrack で 2 解目を探す)
// 3. 未確定セルが残ったら、最も「制約の強い」セルを選んで FILLED/EMPTY を試す → 再帰
// 4. backtrack には:
//    - 最大ステップ数 (デフォ 100k)
//    - 経過時間 (デフォ 5 秒)
//    の二重制限を課し、超過したら timeout として返す
//
// 公開:
// - solveBoard(rowClues, colClues, opts?): { status, sample?, alternative?, stats } を返す

import { countLineSolutions, solveLine, type LineCellState } from './line-solver.ts';

export type SolveStatus = 'unique' | 'multiple' | 'unsolvable' | 'timeout';

export interface SolveStats {
  steps: number;
  elapsedMs: number;
  linePropagationRounds: number;
}

export interface SolveResult {
  status: SolveStatus;
  /** 1 つ目の解 (status='unique' か 'multiple' のとき有効) */
  sample?: ReadonlyArray<ReadonlyArray<0 | 1>>;
  /** 2 つ目の解 (status='multiple' のときのみ有効) */
  alternative?: ReadonlyArray<ReadonlyArray<0 | 1>>;
  /** 論理 line solver だけで全マス確定したか (= no-guess パズル) */
  logicallySolvable: boolean;
  stats: SolveStats;
}

export interface SolveOptions {
  /** backtrack 最大ステップ数 (デフォルト 100,000) */
  maxSteps?: number;
  /** 経過時間タイムアウト ms (デフォルト 5000) */
  timeoutMs?: number;
}

const EMPTY_C: LineCellState = 0;
const FILLED_C: LineCellState = 1;
const UNKNOWN_C: LineCellState = -1;

interface BoardWorking {
  width: number;
  height: number;
  cells: LineCellState[]; // 1D 配列, length = width * height
}

function getCell(b: BoardWorking, col: number, row: number): LineCellState {
  return b.cells[row * b.width + col]!;
}
function setCell(b: BoardWorking, col: number, row: number, v: LineCellState): void {
  b.cells[row * b.width + col] = v;
}
function getRow(b: BoardWorking, row: number): LineCellState[] {
  const out: LineCellState[] = new Array(b.width);
  for (let c = 0; c < b.width; c++) out[c] = b.cells[row * b.width + c]!;
  return out;
}
function getCol(b: BoardWorking, col: number): LineCellState[] {
  const out: LineCellState[] = new Array(b.height);
  for (let r = 0; r < b.height; r++) out[r] = b.cells[r * b.width + col]!;
  return out;
}
function cloneBoard(b: BoardWorking): BoardWorking {
  return { width: b.width, height: b.height, cells: b.cells.slice() };
}
function snapshotSolution(b: BoardWorking): (0 | 1)[][] {
  const out: (0 | 1)[][] = [];
  for (let r = 0; r < b.height; r++) {
    const row: (0 | 1)[] = [];
    for (let c = 0; c < b.width; c++) {
      const v = b.cells[r * b.width + c]!;
      row.push(v === FILLED_C ? 1 : 0);
    }
    out.push(row);
  }
  return out;
}

/**
 * 全行/全列に line solver を反復適用。進展がなくなるまで。
 * 返り値: { changed, contradiction } - contradiction が true なら矛盾 (= 解無し)
 */
function propagate(
  b: BoardWorking,
  rowClues: ReadonlyArray<ReadonlyArray<number>>,
  colClues: ReadonlyArray<ReadonlyArray<number>>,
): { changed: boolean; contradiction: boolean; rounds: number } {
  let totalChanged = false;
  let rounds = 0;
  while (true) {
    rounds++;
    let changed = false;
    // 行
    for (let r = 0; r < b.height; r++) {
      const cur = getRow(b, r);
      const next = solveLine(rowClues[r]!, cur);
      if (next === null) return { changed: totalChanged, contradiction: true, rounds };
      for (let c = 0; c < b.width; c++) {
        if (cur[c] !== next[c]) {
          setCell(b, c, r, next[c]!);
          changed = true;
        }
      }
    }
    // 列
    for (let c = 0; c < b.width; c++) {
      const cur = getCol(b, c);
      const next = solveLine(colClues[c]!, cur);
      if (next === null) return { changed: totalChanged, contradiction: true, rounds };
      for (let r = 0; r < b.height; r++) {
        if (cur[r] !== next[r]) {
          setCell(b, c, r, next[r]!);
          changed = true;
        }
      }
    }
    if (!changed) break;
    totalChanged = true;
  }
  return { changed: totalChanged, contradiction: false, rounds };
}

function isFullyDetermined(b: BoardWorking): boolean {
  for (let i = 0; i < b.cells.length; i++) {
    if (b.cells[i] === UNKNOWN_C) return false;
  }
  return true;
}

/**
 * 解 1 個だけが目的なら limit=1, 一意性判定なら limit=2 にして 2 解見つかったら早期終了。
 *
 * 戻り値:
 *   - solutions: 見つかった解 (最大 limit 個)
 *   - status: 'unique'(=1) / 'multiple'(>=2 で打ち切り) / 'unsolvable' / 'timeout'
 *   - logicallySolvable: backtrack 開始前の propagate で全マス確定したか
 */
export function solveBoard(
  rowClues: ReadonlyArray<ReadonlyArray<number>>,
  colClues: ReadonlyArray<ReadonlyArray<number>>,
  opts: SolveOptions = {},
): SolveResult {
  const maxSteps = opts.maxSteps ?? 100_000;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const startedAt = Date.now();

  const height = rowClues.length;
  const width = colClues.length;
  if (height === 0 || width === 0) {
    return {
      status: 'unsolvable',
      logicallySolvable: false,
      stats: { steps: 0, elapsedMs: 0, linePropagationRounds: 0 },
    };
  }

  // 初期 working board: 全マス UNKNOWN
  const b: BoardWorking = {
    width,
    height,
    cells: new Array(width * height).fill(UNKNOWN_C),
  };

  // 1. 初期 propagate
  const initProp = propagate(b, rowClues, colClues);
  if (initProp.contradiction) {
    return {
      status: 'unsolvable',
      logicallySolvable: false,
      stats: {
        steps: 0,
        elapsedMs: Date.now() - startedAt,
        linePropagationRounds: initProp.rounds,
      },
    };
  }
  const logicallySolvable = isFullyDetermined(b);

  // 2. backtrack で全解 (上限 2) を列挙
  const found: (0 | 1)[][][] = [];
  let steps = 0;
  let totalRounds = initProp.rounds;
  let timedOut = false;

  function backtrack(work: BoardWorking): void {
    if (timedOut || found.length >= 2) return;
    steps++;
    if (steps > maxSteps) {
      timedOut = true;
      return;
    }
    if ((steps & 0xff) === 0 && Date.now() - startedAt > timeoutMs) {
      timedOut = true;
      return;
    }

    // Round 7-C / Gemini レビュー指摘 1: MRV ヒューリスティクス
    // 「未確定マスが最も少ない行/列」のセルを選ぶ → 探索空間を抑える
    // (最初に見つかったセルを選ぶより 15x15 等で大幅に高速化)
    let bestLineUnknowns = Infinity;
    let target = -1;
    // 行の未確定マス数
    for (let r = 0; r < work.height; r++) {
      let unk = 0;
      let firstUnknownInRow = -1;
      for (let c = 0; c < work.width; c++) {
        if (work.cells[r * work.width + c] === UNKNOWN_C) {
          if (firstUnknownInRow === -1) firstUnknownInRow = c;
          unk++;
        }
      }
      if (unk > 0 && unk < bestLineUnknowns) {
        bestLineUnknowns = unk;
        target = r * work.width + firstUnknownInRow;
      }
    }
    // 列の未確定マス数 (行より少ない場合は列由来のセルを採用)
    for (let c = 0; c < work.width; c++) {
      let unk = 0;
      let firstUnknownInCol = -1;
      for (let r = 0; r < work.height; r++) {
        if (work.cells[r * work.width + c] === UNKNOWN_C) {
          if (firstUnknownInCol === -1) firstUnknownInCol = r;
          unk++;
        }
      }
      if (unk > 0 && unk < bestLineUnknowns) {
        bestLineUnknowns = unk;
        target = firstUnknownInCol * work.width + c;
      }
    }

    if (target === -1) {
      // 全マス確定 = 解見つかった
      found.push(snapshotSolution(work));
      return;
    }

    for (const trial of [FILLED_C, EMPTY_C] as const) {
      if (timedOut || found.length >= 2) return;
      const next = cloneBoard(work);
      next.cells[target] = trial;
      const prop = propagate(next, rowClues, colClues);
      totalRounds += prop.rounds;
      if (prop.contradiction) continue;
      backtrack(next);
    }
  }

  backtrack(b);

  const elapsedMs = Date.now() - startedAt;
  const stats: SolveStats = { steps, elapsedMs, linePropagationRounds: totalRounds };

  if (timedOut) {
    return { status: 'timeout', logicallySolvable, stats };
  }
  if (found.length === 0) {
    return { status: 'unsolvable', logicallySolvable, stats };
  }
  if (found.length === 1) {
    return { status: 'unique', sample: found[0]!, logicallySolvable, stats };
  }
  return {
    status: 'multiple',
    sample: found[0]!,
    alternative: found[1]!,
    logicallySolvable,
    stats,
  };
}
