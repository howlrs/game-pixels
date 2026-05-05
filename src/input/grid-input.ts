// docs §90 入力: Mouse / Touch / Keyboard を Pixi.js Canvas に取り付け、Zustand store の action を呼ぶ。
// 12 論点 final §6: PC 左塗/右× + ドラッグ起点セル属性保証 + 同セル再タップトグル / スマホ モード切替 / Undo なし

import type { Application } from 'pixi.js';
import { useGame, type InputMode } from '@game/index.ts';

export interface GridLayout {
  /** 盤面領域 (Canvas 内座標) */
  boardLeftPx: number;
  boardTopPx: number;
  cellPx: number;
  width: number;
  height: number;
}

/**
 * Pixi.js Canvas にマウス + タッチ + キーボードイベントを取り付ける。
 * @returns cleanup 関数
 */
export function attachGridInput(app: Application, getLayout: () => GridLayout): () => void {
  const canvas = app.canvas;

  // canvas 内のクライアント座標 → セル座標。範囲外は null
  function pickCell(clientX: number, clientY: number): { col: number; row: number } | null {
    const layout = getLayout();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX - layout.boardLeftPx;
    const y = (clientY - rect.top) * scaleY - layout.boardTopPx;
    if (x < 0 || y < 0) return null;
    const col = Math.floor(x / layout.cellPx);
    const row = Math.floor(y / layout.cellPx);
    if (col < 0 || row < 0 || col >= layout.width || row >= layout.height) return null;
    return { col, row };
  }

  // マウスボタン (0=左, 2=右) → InputMode
  function buttonToMode(button: number): InputMode | null {
    if (button === 0) return 'fill';
    if (button === 2) return 'mark-x';
    return null;
  }

  // ---- Mouse ----
  function onMouseDown(e: MouseEvent) {
    const cell = pickCell(e.clientX, e.clientY);
    if (!cell) return;
    const mode = buttonToMode(e.button);
    if (!mode) return;
    e.preventDefault();
    useGame.getState().beginDrag(cell.col, cell.row, mode);
  }
  function onMouseMove(e: MouseEvent) {
    const drag = useGame.getState().drag;
    if (!drag) return;
    const cell = pickCell(e.clientX, e.clientY);
    if (!cell) return;
    useGame.getState().dragOver(cell.col, cell.row);
  }
  function onMouseUp() {
    if (useGame.getState().drag) {
      useGame.getState().endDrag();
      useGame.getState().checkClear();
    }
  }
  function onContextMenu(e: MouseEvent) {
    e.preventDefault(); // 右クリックメニュー抑止 (盤面上のみ)
  }

  // ---- Touch ----
  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    const cell = pickCell(t.clientX, t.clientY);
    if (!cell) return;
    e.preventDefault();
    const mode = useGame.getState().mode;
    useGame.getState().beginDrag(cell.col, cell.row, mode);
  }
  function onTouchMove(e: TouchEvent) {
    const drag = useGame.getState().drag;
    if (!drag) return;
    const t = e.touches[0];
    if (!t) return;
    const cell = pickCell(t.clientX, t.clientY);
    if (!cell) return;
    e.preventDefault();
    useGame.getState().dragOver(cell.col, cell.row);
  }
  function onTouchEnd() {
    if (useGame.getState().drag) {
      useGame.getState().endDrag();
      useGame.getState().checkClear();
    }
  }

  // ---- Keyboard (カーソル移動 + Z/X/C/R) ----
  function onKeyDown(e: KeyboardEvent) {
    // フォーカスが INPUT 等の DOM 要素にある場合はスキップ (§9.5.3)
    const target = e.target as Element | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const phase = useGame.getState().phase;
    if (phase !== 'playing') return;

    const layout = getLayout();
    const cur = useGame.getState().cursor ?? { col: 0, row: 0 };

    switch (e.code) {
      case 'ArrowLeft':
        useGame.getState().setCursor({ col: Math.max(0, cur.col - 1), row: cur.row });
        e.preventDefault();
        break;
      case 'ArrowRight':
        useGame.getState().setCursor({ col: Math.min(layout.width - 1, cur.col + 1), row: cur.row });
        e.preventDefault();
        break;
      case 'ArrowUp':
        useGame.getState().setCursor({ col: cur.col, row: Math.max(0, cur.row - 1) });
        e.preventDefault();
        break;
      case 'ArrowDown':
        useGame.getState().setCursor({ col: cur.col, row: Math.min(layout.height - 1, cur.row + 1) });
        e.preventDefault();
        break;
      case 'KeyZ':
      case 'Space':
        useGame.getState().tapCell(cur.col, cur.row, 'fill');
        useGame.getState().checkClear();
        e.preventDefault();
        break;
      case 'KeyX':
        useGame.getState().tapCell(cur.col, cur.row, 'mark-x');
        e.preventDefault();
        break;
      case 'KeyC':
        useGame.getState().tapCell(cur.col, cur.row, 'erase');
        e.preventDefault();
        break;
    }
  }

  // window 単位で listener (canvas は focus を持ちにくい)
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  window.addEventListener('keydown', onKeyDown);

  return () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('contextmenu', onContextMenu);
    // Round 6 / Gemini Pro 指摘: passive: false で attach した listener は同オプションを渡して remove
    canvas.removeEventListener('touchstart', onTouchStart, { passive: false } as EventListenerOptions);
    canvas.removeEventListener('touchmove', onTouchMove, { passive: false } as EventListenerOptions);
    canvas.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('keydown', onKeyDown);
  };
}
