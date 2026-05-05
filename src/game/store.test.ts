import { beforeEach, describe, expect, test } from 'bun:test';
import { EMPTY, FILLED, X_MARKED, type PuzzleData } from '@core/index.ts';
import { useGame } from './store.ts';

const HEART: PuzzleData = {
  meta: {
    id: '5x5-heart',
    title: 'ハート',
    width: 5,
    height: 5,
    difficulty: 'easy',
    estimatedSolveSeconds: 60,
    category: '5x5',
    description: 'テスト',
  },
  solution: [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ],
  rowClues: [[1, 1], [5], [5], [3], [1]],
  colClues: [[2], [4], [4], [4], [2]],
  isUniqueSolution: true,
};

beforeEach(() => {
  useGame.setState({
    phase: 'tap-to-start',
    currentPuzzle: null,
    cursor: null,
    mode: 'fill',
    drag: null,
    elapsedMs: 0,
  });
});

describe('useGame', () => {
  test('loadPuzzle で playing に遷移 + 盤面初期化', () => {
    useGame.getState().loadPuzzle(HEART);
    const s = useGame.getState();
    expect(s.phase).toBe('playing');
    expect(s.board.width).toBe(5);
    expect(s.board.cells.every((c) => c === EMPTY)).toBe(true);
    expect(s.marks.rowMarks.length).toBe(5);
  });

  test('tapCell: トグル仕様 (同モードで再タップ → 空)', () => {
    useGame.getState().loadPuzzle(HEART);
    useGame.getState().tapCell(0, 0, 'fill');
    expect(useGame.getState().board.cells[0]).toBe(FILLED);
    useGame.getState().tapCell(0, 0, 'fill');
    expect(useGame.getState().board.cells[0]).toBe(EMPTY);
  });

  test('beginDrag → dragOver → endDrag: 起点セル属性保証', () => {
    useGame.getState().loadPuzzle(HEART);
    // 起点 (0,0) は EMPTY、fill モード → 起点も塗る、target=FILLED
    useGame.getState().beginDrag(0, 0, 'fill');
    expect(useGame.getState().board.cells[0]).toBe(FILLED);
    expect(useGame.getState().drag?.originState).toBe(EMPTY);
    expect(useGame.getState().drag?.targetState).toBe(FILLED);
    // (1,0) は EMPTY → 塗られる
    useGame.getState().dragOver(1, 0);
    expect(useGame.getState().board.cells[1]).toBe(FILLED);
    // 既に FILLED の (0,0) 状態のセル ((0,0) 自身) を再度通過しても変わらない (originState=EMPTY のため)
    useGame.getState().dragOver(0, 0);
    expect(useGame.getState().board.cells[0]).toBe(FILLED); // 上書きされない
    // ドラッグ終了
    useGame.getState().endDrag();
    expect(useGame.getState().drag).toBeNull();
  });

  test('beginDrag: 起点が FILLED + fill モード → 空に戻る (トグル)、targetState=EMPTY', () => {
    useGame.getState().loadPuzzle(HEART);
    useGame.getState().tapCell(0, 0, 'fill'); // 先に FILLED にしておく
    expect(useGame.getState().board.cells[0]).toBe(FILLED);
    useGame.getState().beginDrag(0, 0, 'fill');
    expect(useGame.getState().board.cells[0]).toBe(EMPTY);
    // ドラッグ中: 同じ FILLED 状態のセルを通過した場合のみ EMPTY 化
    // (1,0) は EMPTY のため変更されない
    useGame.getState().dragOver(1, 0);
    expect(useGame.getState().board.cells[1]).toBe(EMPTY);
  });

  test('toggleRowMark / toggleColMark', () => {
    useGame.getState().loadPuzzle(HEART);
    useGame.getState().toggleRowMark(0, 0);
    expect(useGame.getState().marks.rowMarks[0]![0]).toBe(true);
    useGame.getState().toggleRowMark(0, 0);
    expect(useGame.getState().marks.rowMarks[0]![0]).toBe(false);
  });

  test('checkClear: ハート完成で cleared フェーズに', () => {
    useGame.getState().loadPuzzle(HEART);
    // 全ての正解セルを塗る
    for (let r = 0; r < HEART.meta.height; r++) {
      for (let c = 0; c < HEART.meta.width; c++) {
        if (HEART.solution[r]![c] === 1) {
          useGame.getState().tapCell(c, r, 'fill');
        }
      }
    }
    const ok = useGame.getState().checkClear();
    expect(ok).toBe(true);
    expect(useGame.getState().phase).toBe('cleared');
  });

  test('resetBoard: 全セル空 + マーク全 false', () => {
    useGame.getState().loadPuzzle(HEART);
    useGame.getState().tapCell(0, 0, 'fill');
    useGame.getState().toggleRowMark(0, 0);
    useGame.getState().resetBoard();
    expect(useGame.getState().board.cells.every((c) => c === EMPTY)).toBe(true);
    expect(useGame.getState().marks.rowMarks[0]!.every((m) => !m)).toBe(true);
  });

  test('tickTimer: playing 中は加算', () => {
    useGame.getState().loadPuzzle(HEART);
    useGame.getState().tickTimer(100);
    expect(useGame.getState().elapsedMs).toBe(100);
    useGame.getState().pauseTimer();
    useGame.getState().tickTimer(100);
    expect(useGame.getState().elapsedMs).toBe(100); // pause 中は加算されない
  });

  test('mark-x モードでも tapCell トグル', () => {
    useGame.getState().loadPuzzle(HEART);
    useGame.getState().tapCell(0, 0, 'mark-x');
    expect(useGame.getState().board.cells[0]).toBe(X_MARKED);
    useGame.getState().tapCell(0, 0, 'mark-x');
    expect(useGame.getState().board.cells[0]).toBe(EMPTY);
  });
});
