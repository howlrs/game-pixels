// docs §20 盤面モデル: 三値セル (空 / 塗 / ×) を 1 次元配列で保持。
// 1D 配列の理由 (Round 5 / Gemini Pro deep §94.2.1 注記): Zustand の参照比較で再描画が
// 安全に走るため。2D だと深いミューテーション時のバグの温床。

export type CellState = 'empty' | 'filled' | 'x';

export const EMPTY: CellState = 'empty';
export const FILLED: CellState = 'filled';
export const X_MARKED: CellState = 'x';

export interface Board {
  readonly width: number;
  readonly height: number;
  readonly cells: ReadonlyArray<CellState>;
}

export function createBoard(width: number, height: number): Board {
  return {
    width,
    height,
    cells: new Array<CellState>(width * height).fill(EMPTY),
  };
}

export function indexOf(board: Pick<Board, 'width'>, col: number, row: number): number {
  return row * board.width + col;
}

export function getCell(board: Board, col: number, row: number): CellState {
  return board.cells[indexOf(board, col, row)]!;
}

/**
 * 不変更新: 1 セルだけ変更した新しい Board を返す。
 * Zustand 内で `set((state) => ({ board: setCell(state.board, col, row, FILLED) }))` と使う。
 */
export function setCell(board: Board, col: number, row: number, state: CellState): Board {
  const i = indexOf(board, col, row);
  if (board.cells[i] === state) return board; // 変更なしなら同参照を返す (再レンダリング抑止)
  const next = board.cells.slice();
  next[i] = state;
  return { width: board.width, height: board.height, cells: next };
}

export function resetBoard(board: Board): Board {
  return createBoard(board.width, board.height);
}

/** クリア判定 (§20.5)。× は空セル扱い (補助メモのみ)。solution は 1=塗 / 0=空 の 1D 配列。 */
export function isCleared(board: Board, solution: ReadonlyArray<0 | 1>): boolean {
  if (board.cells.length !== solution.length) return false;
  for (let i = 0; i < board.cells.length; i++) {
    const filled = board.cells[i] === FILLED;
    const target = solution[i] === 1;
    if (filled !== target) return false;
  }
  return true;
}

/** ドラッグ起点セル属性保証 (§40 / §90.4.3): 起点と同じ状態のセルのみ操作対象 */
export function applyAt(
  board: Board,
  col: number,
  row: number,
  current: CellState,
  next: CellState,
): Board {
  if (col < 0 || row < 0 || col >= board.width || row >= board.height) return board;
  if (getCell(board, col, row) !== current) return board;
  return setCell(board, col, row, next);
}
