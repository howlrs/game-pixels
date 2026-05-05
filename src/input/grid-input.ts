// docs §90 入力: Mouse / Touch / Keyboard を Pixi.js Canvas に取り付け、Zustand store の action を呼ぶ。
// 12 論点 final §6: PC 左塗/右× + ドラッグ起点セル属性保証 + 同セル再タップトグル / スマホ モード切替 / Undo なし
//
// β10.0-α: ズーム+パン UI 対応
//   - canvas → world 座標変換に viewport (scale, panX, panY) を適用
//   - ホイールズーム / 2 本指 pinch / 2 本指 pan を追加
//   - 1本指 drag (塗り) と 2本指 (ピンチ+pan) は排他制御 (Gemini Pro deep 指摘)

import type { Application } from 'pixi.js';
import { useGame, type InputMode, VIEWPORT_MIN_SCALE, VIEWPORT_MAX_SCALE } from '@game/index.ts';

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

  // canvas 内 client 座標 → canvas 物理 px 座標
  function clientToCanvas(clientX: number, clientY: number): { cx: number; cy: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      cx: (clientX - rect.left) * scaleX,
      cy: (clientY - rect.top) * scaleY,
    };
  }

  // canvas 内のクライアント座標 → セル座標。範囲外は null
  // β10.0-α: viewport (scale, panX, panY) を反映 — boardRoot.scale/position の逆変換
  function pickCell(clientX: number, clientY: number): { col: number; row: number } | null {
    const layout = getLayout();
    const { cx, cy } = clientToCanvas(clientX, clientY);
    const vp = useGame.getState().viewport;
    // boardRoot 上の world 座標へ変換: world = (canvas - pan) / scale
    const worldX = (cx - vp.panX) / vp.scale;
    const worldY = (cy - vp.panY) / vp.scale;
    const x = worldX - layout.boardLeftPx;
    const y = worldY - layout.boardTopPx;
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

  // ---- Touch (β10.0-α: 1本指=描画, 2本指=ピンチ+pan, 3本以上=無視) ----
  // ジェスチャー状態: 'idle' / 'drawing' / 'gesture' (pinch + pan)
  // 'drawing' 中に 2 本目が触れたら drawing をキャンセルし gesture へ昇格
  // 'gesture' 中に全指が離れるまで描画はロック
  type TouchState =
    | { kind: 'idle' }
    | { kind: 'drawing' }
    | {
        kind: 'gesture';
        startDistance: number;
        startScale: number;
        // 2 本指の中央点 (canvas 物理 px)
        startMidCanvas: { cx: number; cy: number };
        // gesture 開始時の panX/Y
        startPan: { x: number; y: number };
      };
  let touchState: TouchState = { kind: 'idle' };

  function midpointCanvas(t1: Touch, t2: Touch): { cx: number; cy: number } {
    const a = clientToCanvas(t1.clientX, t1.clientY);
    const b = clientToCanvas(t2.clientX, t2.clientY);
    return { cx: (a.cx + b.cx) / 2, cy: (a.cy + b.cy) / 2 };
  }

  function distance(t1: Touch, t2: Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  function onTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1) {
      // 1 本指: drawing 開始 (ただし gesture 中なら drawing 開始しない)
      if (touchState.kind === 'gesture') return;
      const t = e.touches[0]!;
      const cell = pickCell(t.clientX, t.clientY);
      if (!cell) return;
      const mode = useGame.getState().mode;
      useGame.getState().beginDrag(cell.col, cell.row, mode);
      touchState = { kind: 'drawing' };
      return;
    }
    if (e.touches.length >= 2) {
      // 2 本指: drawing をキャンセルし gesture へ
      if (touchState.kind === 'drawing' || useGame.getState().drag) {
        // ドラッグ中なら endDrag してキャンセル (history は board が変わっていれば残る)
        useGame.getState().endDrag();
      }
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const vp = useGame.getState().viewport;
      touchState = {
        kind: 'gesture',
        startDistance: distance(t1, t2),
        startScale: vp.scale,
        startMidCanvas: midpointCanvas(t1, t2),
        startPan: { x: vp.panX, y: vp.panY },
      };
    }
  }
  function onTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (touchState.kind === 'drawing') {
      const t = e.touches[0];
      if (!t) return;
      const cell = pickCell(t.clientX, t.clientY);
      if (!cell) return;
      useGame.getState().dragOver(cell.col, cell.row);
      return;
    }
    if (touchState.kind === 'gesture' && e.touches.length >= 2) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const curDist = distance(t1, t2);
      const curMid = midpointCanvas(t1, t2);
      const ratio = curDist / Math.max(touchState.startDistance, 1);
      const nextScale = Math.max(
        VIEWPORT_MIN_SCALE,
        Math.min(VIEWPORT_MAX_SCALE, touchState.startScale * ratio),
      );
      // ピンチ起点を world 不変に保つ + 中央点の移動を pan に反映
      // canvas = world * scale + pan
      // 開始時点の world = (startMidCanvas - startPan) / startScale
      const worldX = (touchState.startMidCanvas.cx - touchState.startPan.x) / touchState.startScale;
      const worldY = (touchState.startMidCanvas.cy - touchState.startPan.y) / touchState.startScale;
      const panX = curMid.cx - worldX * nextScale;
      const panY = curMid.cy - worldY * nextScale;
      useGame.getState().setViewport({ scale: nextScale, panX, panY });
    }
  }
  function onTouchEnd(e: TouchEvent) {
    if (touchState.kind === 'drawing') {
      // 1 本指リリース: drawing 終了 + checkClear
      if (e.touches.length === 0) {
        if (useGame.getState().drag) {
          useGame.getState().endDrag();
          useGame.getState().checkClear();
        }
        touchState = { kind: 'idle' };
      }
      return;
    }
    if (touchState.kind === 'gesture') {
      // 全指が離れるまで描画ロック維持 (Gemini Pro deep 指摘)
      if (e.touches.length === 0) {
        touchState = { kind: 'idle' };
      } else if (e.touches.length === 1) {
        // 1 本残ったが描画は再開しない (idle へ戻らない)
        // touchState は gesture のまま保持し、次の touchstart で再評価
      }
    }
  }
  function onTouchCancel() {
    if (touchState.kind === 'drawing' && useGame.getState().drag) {
      useGame.getState().endDrag();
    }
    touchState = { kind: 'idle' };
  }

  // ---- Wheel (β10.0-α: マウスホイール / トラックパッド) ----
  // Gemini Pro 指摘 2: トラックパッドのピンチは ctrlKey=true で来るのが Web 標準。
  // 通常 wheel (deltaY) は zoom、ctrlKey 押下時もズーム、それ以外の 2 本指スクロールはパン。
  // Mac: pinch-to-zoom → e.ctrlKey=true (シンセティック)、2 本指 swipe → e.ctrlKey=false → pan
  // PC: マウスホイール → ズーム (ctrl 不要)
  // → 戦略: 2 本指 swipe (deltaX != 0 || ctrlKey == false で deltaY 大量) は pan、それ以外 zoom
  // 安全策: ctrlKey が true のときは必ず zoom (ピンチ)、ctrlKey が false かつ deltaX != 0 のときは pan
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!e.ctrlKey && (e.deltaX !== 0 || (Math.abs(e.deltaY) < 50 && e.deltaMode === 0))) {
      // トラックパッド 2 本指 pan (deltaX が動く or 細かい deltaY): pan
      // boardRoot.position は canvas px なのでそのまま delta を反映 (符号は逆: スワイプ↑ で内容↓)
      useGame.getState().panBy(-e.deltaX, -e.deltaY);
      return;
    }
    // それ以外 (ctrl+wheel ピンチ / マウスホイール): ズーム
    const { cx, cy } = clientToCanvas(e.clientX, e.clientY);
    const vp = useGame.getState().viewport;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = vp.scale * factor;
    useGame.getState().zoomAt(next, cx, cy);
  }

  // ---- Keyboard (カーソル移動 + Z/X/C/R) ----
  function onKeyDown(e: KeyboardEvent) {
    // フォーカスが INPUT 等の DOM 要素にある場合はスキップ (§9.5.3)
    const target = e.target as Element | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const phase = useGame.getState().phase;
    if (phase !== 'playing') return;
    // β5.0-α: Cmd/Ctrl/Meta が押されている場合は他のショートカット (Undo/Redo 等) に譲る
    if (e.ctrlKey || e.metaKey || e.altKey) return;

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
  // β10.0-α: TouchCancel (システム割り込み) も適切に処理
  canvas.addEventListener('touchcancel', onTouchCancel);
  // β10.0-α: Wheel zoom (passive: false で preventDefault 必要)
  canvas.addEventListener('wheel', onWheel, { passive: false });
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
    canvas.removeEventListener('touchcancel', onTouchCancel);
    canvas.removeEventListener('wheel', onWheel, { passive: false } as EventListenerOptions);
    window.removeEventListener('keydown', onKeyDown);
  };
}
