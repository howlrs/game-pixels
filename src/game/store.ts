// docs §94.2.1 Zustand store: ゲーム全体の状態を一括管理。
// 注意: 盤面 cells は 1D 配列 (Round 5 / Gemini Pro deep 指摘で確定)。
// 状態遷移はすべて immutable update (board.ts の setCell が新参照を返す)。

import { create } from 'zustand';
import {
  EMPTY,
  FILLED,
  X_MARKED,
  applyAt,
  createBoard,
  flattenSolution,
  isCleared,
  resetBoard,
  setCell,
  type Board,
  type CellState,
  type PuzzleData,
} from '@core/index.ts';

export type InputMode = 'fill' | 'mark-x' | 'erase';

export type AppPhase =
  | 'tap-to-start'    // 初回画面
  | 'puzzle-select'   // パズル選択画面
  | 'playing'         // パズルプレイ中
  | 'paused'          // 一時停止
  | 'cleared'         // クリア直後の演出 (overlay)
  | 'results';        // 総評ページ (Round 7-A)

export interface ClueMarkState {
  rowMarks: boolean[][]; // [row][hintIndex]
  colMarks: boolean[][]; // [col][hintIndex]
}

export interface CursorPos {
  col: number;
  row: number;
}

export interface DragSession {
  /** ドラッグ開始時のセル状態 (起点セル属性保証, §90.4.3) */
  originState: CellState;
  /** ドラッグ開始時に決まった操作 (起点状態 → 何へ変えるか) */
  targetState: CellState;
}

interface GameStoreState {
  phase: AppPhase;
  currentPuzzle: PuzzleData | null;
  /** クリア判定高速化 (Round 6 / Gemini Pro 指摘): loadPuzzle 時に flattenSolution をキャッシュ */
  flatSolution: ReadonlyArray<0 | 1> | null;
  board: Board;
  cursor: CursorPos | null;
  mode: InputMode;
  marks: ClueMarkState;
  startedAtMs: number; // 開始時刻 (Date.now())
  elapsedMs: number;   // 経過時間 (バックグラウンド中は加算しない)
  drag: DragSession | null;
  /**
   * β5.0-α: Undo/Redo 履歴。
   * history[historyCursor] === { board, marks } (現在状態)。
   * 操作直後に cursor 以降を捨てて新スナップショットを push (典型 undo/redo パターン)。
   * 上限を超えたら古いものから捨てる (HISTORY_LIMIT)。
   * Gemini レビュー指摘: marks も含めることで resetBoard → undo の不整合解消。
   */
  history: ReadonlyArray<{ board: Board; marks: ClueMarkState }>;
  historyCursor: number;
}

interface GameStoreActions {
  setPhase: (phase: AppPhase) => void;
  loadPuzzle: (puzzle: PuzzleData) => void;
  setCursor: (pos: CursorPos | null) => void;
  setMode: (mode: InputMode) => void;
  /** 単発タップ: トグル仕様 (同状態 → 空に戻る) */
  tapCell: (col: number, row: number, mode: InputMode) => void;
  /** ドラッグ開始: 起点セル属性保証 */
  beginDrag: (col: number, row: number, mode: InputMode) => void;
  /** ドラッグ中: 起点と同じ originState のセルだけに targetState を適用 */
  dragOver: (col: number, row: number) => void;
  /** ドラッグ終了 */
  endDrag: () => void;
  toggleRowMark: (row: number, hintIndex: number) => void;
  toggleColMark: (col: number, hintIndex: number) => void;
  resetBoard: () => void;
  tickTimer: (deltaMs: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  /** クリア判定 + 演出フェーズへ。クリアでなければ何もしない。 */
  checkClear: () => boolean;
  /** β5.0-α: 1 ステップ undo (board のみ、marks/cursor は据置) */
  undo: () => void;
  /** β5.0-α: 1 ステップ redo */
  redo: () => void;
  /** UI 用: undo/redo 可否 (購読対象として扱える派生値ではあるが、selector で購読する) */
}

export type GameStore = GameStoreState & GameStoreActions;

function createMarks(puzzle: PuzzleData): ClueMarkState {
  return {
    rowMarks: puzzle.rowClues.map((c) => new Array<boolean>(c.length).fill(false)),
    colMarks: puzzle.colClues.map((c) => new Array<boolean>(c.length).fill(false)),
  };
}

const EMPTY_BOARD: Board = createBoard(1, 1);
const EMPTY_MARKS: ClueMarkState = { rowMarks: [], colMarks: [] };

// β5.0-α: undo/redo 履歴の上限。25x25 = 625 セルのスナップショット 100 個でも数 MB 程度。
const HISTORY_LIMIT = 100;

interface HistorySnapshot {
  board: Board;
  marks: ClueMarkState;
}

/** 履歴に新スナップショットを push するヘルパ。cursor 以降は捨てる + 上限超えは古いものから捨てる。 */
function pushHistory(
  history: ReadonlyArray<HistorySnapshot>,
  cursor: number,
  next: HistorySnapshot,
): { history: ReadonlyArray<HistorySnapshot>; cursor: number } {
  const truncated = history.slice(0, cursor + 1);
  truncated.push(next);
  if (truncated.length > HISTORY_LIMIT) {
    const drop = truncated.length - HISTORY_LIMIT;
    return { history: truncated.slice(drop), cursor: cursor + 1 - drop };
  }
  return { history: truncated, cursor: truncated.length - 1 };
}

/** 入力モード → 該当 CellState の変換 (適用後の状態) */
function modeToState(mode: InputMode): CellState {
  switch (mode) {
    case 'fill':
      return FILLED;
    case 'mark-x':
      return X_MARKED;
    case 'erase':
      return EMPTY;
  }
}

export const useGame = create<GameStore>((set, get) => ({
  phase: 'tap-to-start',
  currentPuzzle: null,
  flatSolution: null,
  board: EMPTY_BOARD,
  cursor: null,
  mode: 'fill',
  marks: EMPTY_MARKS,
  startedAtMs: 0,
  elapsedMs: 0,
  drag: null,
  // β5.0-α: undo/redo 履歴 (初期は EMPTY_BOARD + 空マークのみ)
  history: [{ board: EMPTY_BOARD, marks: EMPTY_MARKS }],
  historyCursor: 0,

  setPhase: (phase) => set({ phase }),

  loadPuzzle: (puzzle) => {
    const initialBoard = createBoard(puzzle.meta.width, puzzle.meta.height);
    const initialMarks = createMarks(puzzle);
    set({
      currentPuzzle: puzzle,
      flatSolution: flattenSolution(puzzle), // Round 6 / Gemini Pro 指摘: 入力時の都度生成回避
      board: initialBoard,
      marks: initialMarks,
      cursor: { col: 0, row: 0 },
      mode: 'fill',
      startedAtMs: Date.now(),
      elapsedMs: 0,
      drag: null,
      phase: 'playing',
      // β5.0-α: 新パズルロードで履歴も初期化 (board + marks のスナップショット)
      history: [{ board: initialBoard, marks: initialMarks }],
      historyCursor: 0,
    });
  },

  setCursor: (pos) => set({ cursor: pos }),
  setMode: (mode) => set({ mode }),

  tapCell: (col, row, mode) => {
    const { board, marks, history, historyCursor } = get();
    const targetState = modeToState(mode);
    const i = row * board.width + col;
    const cur = board.cells[i];
    if (cur === undefined) return;
    // 同セルを同じモードで再タップ → 空に戻す (トグル, §40 / §90.4.3)
    const next = cur === targetState ? EMPTY : targetState;
    const updated = setCell(board, col, row, next);
    if (updated !== board) {
      // β5.0-α: 履歴に push (board + 現 marks のスナップショット)
      const h = pushHistory(history, historyCursor, { board: updated, marks });
      set({ board: updated, cursor: { col, row }, history: h.history, historyCursor: h.cursor });
    }
  },

  beginDrag: (col, row, mode) => {
    const { board } = get();
    const i = row * board.width + col;
    const originState = board.cells[i] ?? EMPTY;
    const targetState = modeToState(mode);
    // 起点セルもまず操作: トグル仕様 (起点が targetState と同じなら空へ)
    const startNext = originState === targetState ? EMPTY : targetState;
    const updated = setCell(board, col, row, startNext);
    // β5.0-α: ドラッグ中は board のみ更新、history は endDrag でまとめて push
    set({
      board: updated,
      cursor: { col, row },
      drag: { originState, targetState: startNext },
    });
  },

  dragOver: (col, row) => {
    const { board, drag } = get();
    if (!drag) return;
    // 起点と同じ状態のセルのみ targetState に変える
    const next = applyAt(board, col, row, drag.originState, drag.targetState);
    if (next !== board) set({ board: next, cursor: { col, row } });
  },

  endDrag: () => {
    const { drag, board, marks, history, historyCursor } = get();
    if (!drag) {
      set({ drag: null });
      return;
    }
    // β5.0-α: ドラッグ確定で 1 エントリだけ履歴に push (board + marks)
    // 履歴の先頭 (= 直前のスナップショット) と board が同じ参照なら push 不要 (no-op ドラッグ)
    const last = history[historyCursor];
    if (!last || last.board !== board) {
      const h = pushHistory(history, historyCursor, { board, marks });
      set({ drag: null, history: h.history, historyCursor: h.cursor });
    } else {
      set({ drag: null });
    }
  },

  toggleRowMark: (row, hintIndex) => {
    const { board, marks, history, historyCursor } = get();
    const rowMarks = marks.rowMarks.slice();
    const target = rowMarks[row];
    if (!target || target[hintIndex] === undefined) return;
    const newRow = target.slice();
    newRow[hintIndex] = !newRow[hintIndex];
    rowMarks[row] = newRow;
    const nextMarks = { rowMarks, colMarks: marks.colMarks };
    // β5.0-α: marks 変更も履歴に push
    const h = pushHistory(history, historyCursor, { board, marks: nextMarks });
    set({ marks: nextMarks, history: h.history, historyCursor: h.cursor });
  },

  toggleColMark: (col, hintIndex) => {
    const { board, marks, history, historyCursor } = get();
    const colMarks = marks.colMarks.slice();
    const target = colMarks[col];
    if (!target || target[hintIndex] === undefined) return;
    const newCol = target.slice();
    newCol[hintIndex] = !newCol[hintIndex];
    colMarks[col] = newCol;
    const nextMarks = { rowMarks: marks.rowMarks, colMarks };
    const h = pushHistory(history, historyCursor, { board, marks: nextMarks });
    set({ marks: nextMarks, history: h.history, historyCursor: h.cursor });
  },

  resetBoard: () => {
    const { currentPuzzle, board, history, historyCursor } = get();
    if (!currentPuzzle) return;
    const reset = resetBoard(board);
    const resetMarks = createMarks(currentPuzzle);
    // β5.0-α: 履歴に reset board + 空 marks を 1 エントリ push (Undo で元に戻せる)
    const h = pushHistory(history, historyCursor, { board: reset, marks: resetMarks });
    set({
      board: reset,
      marks: resetMarks,
      drag: null,
      history: h.history,
      historyCursor: h.cursor,
    });
  },

  tickTimer: (deltaMs) => {
    const { phase } = get();
    if (phase !== 'playing') return;
    set((s) => ({ elapsedMs: s.elapsedMs + deltaMs }));
  },

  pauseTimer: () => set({ phase: 'paused' }),
  resumeTimer: () => {
    const { currentPuzzle } = get();
    if (currentPuzzle) set({ phase: 'playing' });
  },

  checkClear: () => {
    const { flatSolution, board } = get();
    if (!flatSolution) return false;
    if (isCleared(board, flatSolution)) {
      set({ phase: 'cleared' });
      return true;
    }
    return false;
  },

  // β5.0-α: Undo (cursor を 1 つ戻す + marks 復元 + クリア判定)
  undo: () => {
    const { history, historyCursor, drag, flatSolution } = get();
    if (drag) return; // ドラッグ中は無視 (中間状態の整合性を守る)
    if (historyCursor <= 0) return;
    const next = historyCursor - 1;
    const snap = history[next]!;
    set({ board: snap.board, marks: snap.marks, historyCursor: next });
    // β5.0-α / Gemini 指摘: undo/redo 後にクリア判定 (戻して/進めて正解状態になった場合)
    if (flatSolution && isCleared(snap.board, flatSolution)) {
      set({ phase: 'cleared' });
    }
  },

  // β5.0-α: Redo (cursor を 1 つ進める + marks 復元 + クリア判定)
  redo: () => {
    const { history, historyCursor, drag, flatSolution } = get();
    if (drag) return;
    if (historyCursor >= history.length - 1) return;
    const next = historyCursor + 1;
    const snap = history[next]!;
    set({ board: snap.board, marks: snap.marks, historyCursor: next });
    if (flatSolution && isCleared(snap.board, flatSolution)) {
      set({ phase: 'cleared' });
    }
  },
}));
