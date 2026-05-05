// docs §91 描画: 盤面 + ヒント数字 + カーソル + クリア演出 を Pixi.js で描画。
// ノノグラムは描画頻度が低いので「state 変更時に全消し → 全描画」の単純な実装で十分 (15×15 = 225 セルなら 60fps 余裕)。

import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  type ColorSource,
} from 'pixi.js';
import { EMPTY, FILLED, X_MARKED, type Board, type CellState, type PuzzleData } from '@core/index.ts';
import type { ClueMarkState, CursorPos } from '@game/index.ts';
import type { GridLayout } from '@input/index.ts';

const COLOR_BG = 0x1a1a1a;
const COLOR_GRID_LINE = 0x444444;
const COLOR_GRID_LINE_STRONG = 0x888888; // 5 セルごと
const COLOR_FILLED = 0xeeeeee;
const COLOR_X = 0xff5577;
const COLOR_HINT_TEXT = 0xeeeeee;
const COLOR_HINT_DONE = 0x666666; // 取り消し線済
const COLOR_CURSOR = 0xffcc00;
const COLOR_CLEAR_OVERLAY = 0x55ff77;

export interface GridRenderer {
  /** state 変化時に呼ぶ。全描画。 */
  draw(state: GridDrawState): void;
  destroy(): void;
  layout(): GridLayout;
}

export interface GridDrawState {
  board: Board;
  puzzle: PuzzleData;
  marks: ClueMarkState;
  cursor: CursorPos | null;
  cleared: boolean;
}

export function createGridRenderer(app: Application): GridRenderer {
  const root = new Container();
  app.stage.addChild(root);

  // 計算後の layout を保持
  let currentLayout: GridLayout = { boardLeftPx: 0, boardTopPx: 0, cellPx: 32, width: 5, height: 5 };

  function computeLayout(state: GridDrawState): GridLayout {
    const w = state.board.width;
    const h = state.board.height;
    const rowHintMaxLen = Math.max(...state.puzzle.rowClues.map((c) => c.length), 1);
    const colHintMaxLen = Math.max(...state.puzzle.colClues.map((c) => c.length), 1);

    const canvasW = app.canvas.width;
    const canvasH = app.canvas.height;
    const reserveTop = 16; // HUD は React 側 DOM、Canvas には HUD なし
    const reserveBottom = 16;
    const availW = canvasW - 16;
    const availH = canvasH - reserveTop - reserveBottom;

    // ヒント領域 ≈ rowHintMaxLen * cellPx * 0.6
    const cellByW = availW / (w + rowHintMaxLen * 0.6);
    const cellByH = availH / (h + colHintMaxLen * 0.6);
    const cellPx = Math.max(20, Math.floor(Math.min(cellByW, cellByH)));
    const hintLeft = Math.ceil(rowHintMaxLen * cellPx * 0.6);
    const hintTop = Math.ceil(colHintMaxLen * cellPx * 0.6);
    const totalW = hintLeft + w * cellPx;
    const totalH = hintTop + h * cellPx;
    const offsetX = Math.floor((canvasW - totalW) / 2);
    const offsetY = Math.floor((canvasH - totalH) / 2);

    return {
      boardLeftPx: offsetX + hintLeft,
      boardTopPx: offsetY + hintTop,
      cellPx,
      width: w,
      height: h,
    };
  }

  function clear(): void {
    root.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  function draw(state: GridDrawState): void {
    clear();
    const layout = computeLayout(state);
    currentLayout = layout;
    const { boardLeftPx, boardTopPx, cellPx, width, height } = layout;

    // 1. 背景
    const bg = new Graphics().rect(0, 0, app.canvas.width, app.canvas.height).fill(COLOR_BG);
    root.addChild(bg);

    // 2. 列ヒント (盤面の上)
    const hintStyle = new TextStyle({
      fill: COLOR_HINT_TEXT as ColorSource,
      fontSize: Math.max(10, Math.floor(cellPx * 0.45)),
      fontFamily: 'monospace',
      align: 'center',
    });
    const hintDoneStyle = new TextStyle({
      fill: COLOR_HINT_DONE as ColorSource,
      fontSize: Math.max(10, Math.floor(cellPx * 0.45)),
      fontFamily: 'monospace',
      align: 'center',
    });

    for (let col = 0; col < width; col++) {
      const clue = state.puzzle.colClues[col]!;
      const colMarks = state.marks.colMarks[col] ?? [];
      const x = boardLeftPx + col * cellPx + cellPx / 2;
      // 数字を縦に並べる、下端 = 盤面上端
      for (let i = 0; i < clue.length; i++) {
        const isDone = colMarks[i] === true;
        const txt = new Text({ text: String(clue[i]!), style: isDone ? hintDoneStyle : hintStyle });
        txt.anchor.set(0.5, 1);
        txt.x = x;
        txt.y = boardTopPx - 2 - (clue.length - 1 - i) * (cellPx * 0.5);
        root.addChild(txt);
      }
    }

    // 3. 行ヒント (盤面の左)
    for (let row = 0; row < height; row++) {
      const clue = state.puzzle.rowClues[row]!;
      const rowMarks = state.marks.rowMarks[row] ?? [];
      const y = boardTopPx + row * cellPx + cellPx / 2;
      // 数字を横に並べる、右端 = 盤面左端
      for (let i = 0; i < clue.length; i++) {
        const isDone = rowMarks[i] === true;
        const txt = new Text({ text: String(clue[i]!), style: isDone ? hintDoneStyle : hintStyle });
        txt.anchor.set(1, 0.5);
        txt.x = boardLeftPx - 4 - (clue.length - 1 - i) * (cellPx * 0.6);
        txt.y = y;
        root.addChild(txt);
      }
    }

    // 4. セル
    const cellsG = new Graphics();
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * width + col;
        const cs: CellState = state.board.cells[i] ?? EMPTY;
        const x = boardLeftPx + col * cellPx;
        const y = boardTopPx + row * cellPx;
        if (cs === FILLED) {
          const fillColor = state.cleared ? COLOR_CLEAR_OVERLAY : COLOR_FILLED;
          cellsG.rect(x + 1, y + 1, cellPx - 2, cellPx - 2).fill(fillColor);
        }
        if (cs === X_MARKED) {
          // × 記号: 線 2 本
          const inset = Math.floor(cellPx * 0.25);
          cellsG.moveTo(x + inset, y + inset).lineTo(x + cellPx - inset, y + cellPx - inset).stroke({ color: COLOR_X, width: 2 });
          cellsG.moveTo(x + cellPx - inset, y + inset).lineTo(x + inset, y + cellPx - inset).stroke({ color: COLOR_X, width: 2 });
        }
      }
    }
    root.addChild(cellsG);

    // 5. グリッド線 (5 セルごと太く)
    const gridG = new Graphics();
    for (let i = 0; i <= width; i++) {
      const strong = i % 5 === 0;
      const w = strong ? 2 : 1;
      const color = strong ? COLOR_GRID_LINE_STRONG : COLOR_GRID_LINE;
      gridG.moveTo(boardLeftPx + i * cellPx, boardTopPx).lineTo(boardLeftPx + i * cellPx, boardTopPx + height * cellPx).stroke({ color, width: w });
    }
    for (let i = 0; i <= height; i++) {
      const strong = i % 5 === 0;
      const w = strong ? 2 : 1;
      const color = strong ? COLOR_GRID_LINE_STRONG : COLOR_GRID_LINE;
      gridG.moveTo(boardLeftPx, boardTopPx + i * cellPx).lineTo(boardLeftPx + width * cellPx, boardTopPx + i * cellPx).stroke({ color, width: w });
    }
    root.addChild(gridG);

    // 6. カーソル (キーボード操作時のみ)
    if (state.cursor) {
      const cx = boardLeftPx + state.cursor.col * cellPx;
      const cy = boardTopPx + state.cursor.row * cellPx;
      const cursorG = new Graphics()
        .rect(cx + 1, cy + 1, cellPx - 2, cellPx - 2)
        .stroke({ color: COLOR_CURSOR, width: 2 });
      root.addChild(cursorG);
    }
  }

  return {
    draw,
    layout: () => currentLayout,
    destroy: () => {
      clear();
      root.destroy({ children: true });
    },
  };
}
