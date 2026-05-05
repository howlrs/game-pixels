// docs §91 描画: 盤面 + ヒント数字 + カーソル + クリア演出 を Pixi.js で描画。
// ノノグラムは描画頻度が低いので「state 変更時に全消し → 全描画」の単純な実装で十分 (15×15 = 225 セルなら 60fps 余裕)。
//
// Round 7-B: クリア時のセル回転アニメーション (波状回転) を追加。
// playClearAnimation() がコールされている間は通常の draw() 結果を上書きし、
// 個別 Graphics で各塗りセルを pivot=中央 / rotation で回転させる。

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

// β4.0-β: 配色パレット — 通常 / ハイコントラスト の 2 系統。
// body[data-high-contrast="true"] が付いているときに HC 版を返す。
interface Palette {
  bg: number;
  gridLine: number;
  gridLineStrong: number;
  filled: number;
  xMark: number;
  hintText: number;
  hintDone: number;
  hintAutoComplete: number;
  cursor: number;
  clearOverlay: number;
}

const PALETTE_DEFAULT: Palette = {
  bg: 0x1a1a1a,
  gridLine: 0x444444,
  gridLineStrong: 0x888888,
  filled: 0xeeeeee,
  xMark: 0xff5577,
  hintText: 0xeeeeee,
  hintDone: 0x666666,
  hintAutoComplete: 0x55cc77,
  cursor: 0xffcc00,
  clearOverlay: 0x55ff77,
};

const PALETTE_HIGH_CONTRAST: Palette = {
  bg: 0x000000,
  gridLine: 0xaaaaaa,
  gridLineStrong: 0xffffff,
  filled: 0xffffff,
  // Gemini 指摘: より明度を上げて視認性確保 (黒背景で約 5:1 → AA 余裕)
  xMark: 0xff5555,
  hintText: 0xffffff,
  // Gemini 指摘: 0x999999 は AAA (7:1) に届かない → 0xcccccc (約 11:1) に上げる
  hintDone: 0xcccccc,
  hintAutoComplete: 0x00ff66,
  cursor: 0xffee00,
  clearOverlay: 0x00ff66,
};

function getPalette(): Palette {
  if (typeof document !== 'undefined' && document.body.dataset.highContrast === 'true') {
    return PALETTE_HIGH_CONTRAST;
  }
  return PALETTE_DEFAULT;
}

/**
 * β3.0-α: 行 / 列の塗りパターンが正解と一致するか判定。
 * - cells[i] === FILLED ⇔ expected[i] === 1 がすべて成立で true
 * - X_MARKED / EMPTY は両方 0 扱い (= 塗っていない)
 * - false の場合は「まだ完成していない」(過剰塗り or 不足塗り)
 */
function isLineComplete(
  cells: ReadonlyArray<CellState | undefined>,
  expected: ReadonlyArray<0 | 1>,
): boolean {
  if (cells.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    const isFilled = cells[i] === FILLED;
    const shouldFill = expected[i] === 1;
    if (isFilled !== shouldFill) return false;
  }
  return true;
}

export interface GridRenderer {
  /** state 変化時に呼ぶ。全描画。 */
  draw(state: GridDrawState): void;
  /**
   * Round 7-B: クリア時の波状セル回転アニメ。
   * - 完了時に onComplete を必ず呼ぶ (skip 時も同期発火)
   * - prefers-reduced-motion: reduce が true の場合は即時 onComplete (アニメ無し)
   * - アニメ中に再度呼ばれた場合は既存アニメを cancel して新規開始
   */
  playClearAnimation(state: GridDrawState, onComplete: () => void): void;
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

    // ヒント領域比率: 行ヒント幅 = rowHintMaxLen * cellPx * 0.6, 列ヒント高 = colHintMaxLen * cellPx * 0.5
    // (列ヒントは縦並びなので少し詰めて 0.5)
    const cellByW = availW / (w + rowHintMaxLen * 0.6);
    const cellByH = availH / (h + colHintMaxLen * 0.5);
    // Round 7-E / Gemini Pro deep 指摘 3:
    // 内部解像度 720 で 25x25 でも 1 マス ≥16px (デスクトップ最小タップ目安)
    // 5x5 / 10x10 / 15x15 では自動的に 16px より大きくなる
    // 将来課題: ズーム+パン UI で 44px 担保
    const cellPx = Math.max(16, Math.floor(Math.min(cellByW, cellByH)));
    const hintLeft = Math.ceil(rowHintMaxLen * cellPx * 0.6);
    const hintTop = Math.ceil(colHintMaxLen * cellPx * 0.5);
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
    const palette = getPalette();

    // 1. 背景
    const bg = new Graphics().rect(0, 0, app.canvas.width, app.canvas.height).fill(palette.bg);
    root.addChild(bg);

    // 2. 列ヒント (盤面の上)
    const hintStyle = new TextStyle({
      fill: palette.hintText as ColorSource,
      fontSize: Math.max(10, Math.floor(cellPx * 0.45)),
      fontFamily: 'monospace',
      align: 'center',
    });
    const hintDoneStyle = new TextStyle({
      fill: palette.hintDone as ColorSource,
      fontSize: Math.max(10, Math.floor(cellPx * 0.45)),
      fontFamily: 'monospace',
      align: 'center',
    });
    // β3.0-α: 自動完成スタイル (行/列が正解通り塗られている時)
    const hintAutoCompleteStyle = new TextStyle({
      fill: palette.hintAutoComplete as ColorSource,
      fontSize: Math.max(10, Math.floor(cellPx * 0.45)),
      fontFamily: 'monospace',
      fontWeight: 'bold',
      align: 'center',
    });

    // β3.0-α: 各行/列の自動完成判定 (1 回だけ計算してループで再利用)
    const rowComplete: boolean[] = new Array(height).fill(false);
    const colComplete: boolean[] = new Array(width).fill(false);
    if (state.puzzle.solution.length === height) {
      for (let r = 0; r < height; r++) {
        const expected = state.puzzle.solution[r];
        if (!expected || expected.length !== width) continue;
        const rowCells: CellState[] = new Array(width);
        for (let c = 0; c < width; c++) rowCells[c] = state.board.cells[r * width + c] ?? EMPTY;
        rowComplete[r] = isLineComplete(rowCells, expected);
      }
      for (let c = 0; c < width; c++) {
        const expected: (0 | 1)[] = new Array(height);
        for (let r = 0; r < height; r++) expected[r] = state.puzzle.solution[r]?.[c] ?? 0;
        const colCells: CellState[] = new Array(height);
        for (let r = 0; r < height; r++) colCells[r] = state.board.cells[r * width + c] ?? EMPTY;
        colComplete[c] = isLineComplete(colCells, expected);
      }
    }

    for (let col = 0; col < width; col++) {
      const clue = state.puzzle.colClues[col]!;
      const colMarks = state.marks.colMarks[col] ?? [];
      const x = boardLeftPx + col * cellPx + cellPx / 2;
      const isAutoComplete = colComplete[col]!;
      // 数字を縦に並べる、下端 = 盤面上端
      // §30.3 ゼロ行 (clue=[0]): プレイヤーにとって「全マス×」確定の重要情報なので必ず表示
      // (Round 7-E / Gemini Pro deep 指摘 1)
      for (let i = 0; i < clue.length; i++) {
        const isDone = colMarks[i] === true;
        // β3.0-α: 優先順 = 自動完成 > 手動マーク済 > 通常
        const style = isAutoComplete
          ? hintAutoCompleteStyle
          : isDone
            ? hintDoneStyle
            : hintStyle;
        const txt = new Text({ text: String(clue[i]!), style });
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
      const isAutoComplete = rowComplete[row]!;
      // §30.3 ゼロ行は必ず表示 (Round 7-E / Gemini Pro deep 指摘 1)
      // 数字を横に並べる、右端 = 盤面左端
      for (let i = 0; i < clue.length; i++) {
        const isDone = rowMarks[i] === true;
        const style = isAutoComplete
          ? hintAutoCompleteStyle
          : isDone
            ? hintDoneStyle
            : hintStyle;
        const txt = new Text({ text: String(clue[i]!), style });
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
          const fillColor = state.cleared ? palette.clearOverlay : palette.filled;
          cellsG.rect(x + 1, y + 1, cellPx - 2, cellPx - 2).fill(fillColor);
        }
        if (cs === X_MARKED) {
          // × 記号: 線 2 本 (各線で個別 Graphics + path にして抜けを防ぐ)
          const inset = Math.floor(cellPx * 0.25);
          const xG = new Graphics();
          xG.moveTo(x + inset, y + inset).lineTo(x + cellPx - inset, y + cellPx - inset).stroke({ color: palette.xMark, width: 2 });
          xG.moveTo(x + cellPx - inset, y + inset).lineTo(x + inset, y + cellPx - inset).stroke({ color: palette.xMark, width: 2 });
          root.addChild(xG);
        }
      }
    }
    root.addChild(cellsG);

    // 5. グリッド線 (5 セルごと太く)
    // Pixi.js v8 の Graphics で moveTo+lineTo+stroke をループ連続コールすると、
    // path 分離が不十分で line が抜ける問題があるため、各線を rect (矩形塗り) で描画する
    // (Round 6 / ユーザー報告の「row 3-4 間の横線抜け」修正)。
    const gridG = new Graphics();
    const totalW = width * cellPx;
    const totalH = height * cellPx;
    for (let i = 0; i <= width; i++) {
      const strong = i % 5 === 0;
      const w = strong ? 2 : 1;
      const color = strong ? palette.gridLineStrong : palette.gridLine;
      // 縦線: x = boardLeftPx + i*cellPx を中心に幅 w の矩形
      gridG.rect(boardLeftPx + i * cellPx - Math.floor(w / 2), boardTopPx, w, totalH).fill(color);
    }
    for (let i = 0; i <= height; i++) {
      const strong = i % 5 === 0;
      const w = strong ? 2 : 1;
      const color = strong ? palette.gridLineStrong : palette.gridLine;
      // 横線
      gridG.rect(boardLeftPx, boardTopPx + i * cellPx - Math.floor(w / 2), totalW, w).fill(color);
    }
    root.addChild(gridG);

    // 6. カーソル (キーボード操作時のみ)
    if (state.cursor) {
      const cx = boardLeftPx + state.cursor.col * cellPx;
      const cy = boardTopPx + state.cursor.row * cellPx;
      const cursorG = new Graphics()
        .rect(cx + 1, cy + 1, cellPx - 2, cellPx - 2)
        .stroke({ color: palette.cursor, width: 2 });
      root.addChild(cursorG);
    }
  }

  /**
   * Round 7-B: クリア時のセル回転アニメ。
   * 既存の draw() 結果 (cellsG) を消し、塗りセルを個別 Graphics として pivot 中央に置き、
   * 波状 (col+row が小さい順) に 360° 回転させる。
   *
   * Gemini Pro deep 指摘: skip 時も onComplete を同期発火する。
   *  - prefers-reduced-motion: reduce → 即時 onComplete (アニメ全スキップ)
   *  - アニメ中に新たに呼ばれた → 旧 ticker を cancel + 旧 onComplete は呼ばず破棄
   *
   * 安全策: onComplete が複数回呼ばれないよう done フラグ管理
   */
  let activeAnimCancel: (() => void) | null = null;
  let activeAnimContainer: Container | null = null;
  function playClearAnimation(state: GridDrawState, onComplete: () => void): void {
    // 旧アニメがあれば即 cancel (旧 onComplete は呼ばない)
    if (activeAnimCancel) {
      activeAnimCancel();
      activeAnimCancel = null;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      activeAnimCancel = null;
      // Round 7-B / Gemini 指摘 ①: anim container を即破棄してメモリリーク予防
      // (clear()/draw() で次回破棄されるが、results 遷移後に draw() が呼ばれない可能性に備える)
      if (activeAnimContainer) {
        activeAnimContainer.destroy({ children: true });
        activeAnimContainer = null;
      }
      onComplete();
    };

    // β3.0-β: prefers-reduced-motion (OS) または body[data-reduce-motion="true"] (ユーザー設定) で即終了
    const reducedMotion =
      typeof window !== 'undefined' &&
      ((window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
        (typeof document !== 'undefined' && document.body.dataset.reduceMotion === 'true'));
    if (reducedMotion) {
      // 通常 draw を出してから同期的に finish (盤面は緑になる, アニメ無し)
      draw(state);
      finish();
      return;
    }

    // ベース描画 (背景 / ヒント / グリッド線 / カーソルあり) を draw した上で
    // 塗りセルだけ個別 Graphics でかぶせる
    draw(state);
    // draw() の cellsG (FILLED 全部入り) を非表示にしないと二重描画になるので、
    // root の子から最後に追加された cellsG を探して削除するのは脆い → 専用 anim container 方式に統一
    // → 簡易対策: cellsG は draw() 内で root.addChild されているが、その上に anim が乗ると気にならない。
    //   ただし回転中はベース cellsG が静止して見えるため、anim 用の塗りセルだけ FILLED 色を白にし
    //   ベース cellsG の塗り色は同じ (cleared=true 時は緑) なので視覚的に問題なし。
    //   → ベース cellsG 透明化のため、別途 anim 用 Container を root の上に重ねて完全に塗りつぶす。

    const layout = currentLayout;
    const { boardLeftPx, boardTopPx, cellPx, width, height } = layout;
    // β4.0-β: ハイコントラスト切替に対応 (palette を取得)
    const palette = getPalette();
    const animContainer = new Container();
    activeAnimContainer = animContainer;
    root.addChild(animContainer);

    // 塗りセル一覧を抽出 + アニメ初期化
    interface AnimCell {
      g: Graphics;
      delay: number; // ms
      duration: number; // ms
      startTime: number; // performance.now() 相対
      cx: number;
      cy: number;
    }
    const animCells: AnimCell[] = [];
    const PER_CELL_DURATION = 500; // 各セルの回転時間 (ms)
    const WAVE_STAGGER = 60; // 隣接セル間の遅延 (ms): 大きいほど波が緩やか
    let maxStart = 0;

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * width + col;
        const cs: CellState = state.board.cells[i] ?? EMPTY;
        if (cs !== FILLED) continue;
        const cx = boardLeftPx + col * cellPx + cellPx / 2;
        const cy = boardTopPx + row * cellPx + cellPx / 2;
        const g = new Graphics()
          .rect(-(cellPx - 2) / 2, -(cellPx - 2) / 2, cellPx - 2, cellPx - 2)
          .fill(palette.clearOverlay);
        g.x = cx;
        g.y = cy;
        // pivot は (0,0) のまま (rect が中央基準で描画されているため)
        const delay = (col + row) * WAVE_STAGGER;
        animCells.push({
          g,
          delay,
          duration: PER_CELL_DURATION,
          startTime: 0, // 後で startedAt 基準で算出
          cx,
          cy,
        });
        animContainer.addChild(g);
        if (delay + PER_CELL_DURATION > maxStart) maxStart = delay + PER_CELL_DURATION;
      }
    }

    // セルが 1 つも無い場合 (空盤面) は即終了
    if (animCells.length === 0) {
      animContainer.destroy({ children: true });
      finish();
      return;
    }

    // safety: animation が 5 秒経っても終わらない場合は強制終了
    const ABSOLUTE_TIMEOUT = Math.max(maxStart + 200, 1500) + 3000;

    const startedAt = performance.now();
    let raf = 0;
    const tick = () => {
      const t = performance.now() - startedAt;
      let allDone = true;
      for (const ac of animCells) {
        const local = t - ac.delay;
        if (local <= 0) {
          ac.g.rotation = 0;
          allDone = false;
          continue;
        }
        if (local >= ac.duration) {
          ac.g.rotation = 0;
          continue;
        }
        // ease-in-out cubic で 0 → 2π
        const k = local / ac.duration;
        const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        ac.g.rotation = eased * Math.PI * 2;
        allDone = false;
      }
      if (allDone || t > ABSOLUTE_TIMEOUT) {
        cancelAnimationFrame(raf);
        // anim container は画面に残しておく (次の draw が消す)
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    activeAnimCancel = () => {
      cancelAnimationFrame(raf);
      animContainer.destroy({ children: true });
      if (activeAnimContainer === animContainer) activeAnimContainer = null;
      // 旧 onComplete は呼ばない (Gemini deep 指摘)
    };
  }

  return {
    draw,
    playClearAnimation,
    layout: () => currentLayout,
    destroy: () => {
      if (activeAnimCancel) activeAnimCancel();
      clear();
      root.destroy({ children: true });
    },
  };
}
