// 2026-05-08 / モバイル描画問題切り分け用デバッグ HUD (Gemini Pro deep 合議)。
// URL に ?debug=1 を付けると画面右上に renderer 種類 / canvas dims / GPU 等を表示する。
// 通常時は何もレンダリングしない (常時マウントだが空 DOM)。

import { useEffect, useState } from 'react';

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}

interface RendererInfo {
  rendererType: string;
  canvasW: number;
  canvasH: number;
  clientW: number;
  clientH: number;
  dpr: number;
  hasWebGPU: boolean;
  hasWebGL2: boolean;
  uaShort: string;
}

function gatherInfo(): RendererInfo {
  const cv = document.querySelector<HTMLCanvasElement>('canvas');
  let rendererType = 'no-canvas';
  if (cv) {
    rendererType = 'canvas-present';
    // Pixi.js v8: app.renderer の name は型 'webgl' | 'webgpu' を返すが、
    // ここでは canvas 単体しか参照できないので「canvas が存在する」のみ報告。
    // 詳細は console.info('[pixels] mountPixi') も参照。
  }
  return {
    rendererType,
    canvasW: cv?.width ?? 0,
    canvasH: cv?.height ?? 0,
    clientW: cv?.clientWidth ?? 0,
    clientH: cv?.clientHeight ?? 0,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 0,
    hasWebGPU: typeof navigator !== 'undefined' && 'gpu' in navigator,
    hasWebGL2: (() => {
      try {
        const c = document.createElement('canvas');
        return !!c.getContext('webgl2');
      } catch {
        return false;
      }
    })(),
    uaShort: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : '',
  };
}

export function DebugHud() {
  const [enabled] = useState<boolean>(() => isDebugEnabled());
  const [info, setInfo] = useState<RendererInfo | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const update = () => setInfo(gatherInfo());
    update();
    const id = window.setInterval(update, 1000);

    // window.onerror / unhandledrejection を観測してデバッグ HUD に追記
    const onError = (e: ErrorEvent) => {
      setErrors((prev) => [...prev.slice(-9), `err: ${e.message?.slice(0, 80) ?? '?'}`]);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason && (e.reason.message || String(e.reason));
      setErrors((prev) => [...prev.slice(-9), `rej: ${String(reason).slice(0, 80)}`]);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [enabled]);

  if (!enabled || !info) return null;

  const lines = [
    `renderer: ${info.rendererType}`,
    `canvas: ${info.canvasW}x${info.canvasH} (client ${info.clientW}x${info.clientH})`,
    `DPR: ${info.dpr}`,
    `WebGPU: ${info.hasWebGPU ? 'yes' : 'no'}, WebGL2: ${info.hasWebGL2 ? 'yes' : 'no'}`,
    `UA: ${info.uaShort}`,
    ...errors,
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(8px, env(safe-area-inset-top, 0px))',
        right: 'max(8px, env(safe-area-inset-right, 0px))',
        zIndex: 99999,
        background: 'rgba(0,0,0,0.85)',
        color: '#0f0',
        padding: '6px 8px',
        fontFamily: 'monospace',
        fontSize: '10px',
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
        maxWidth: '60vw',
        pointerEvents: 'none',
        borderRadius: 4,
      }}
    >
      {lines.join('\n')}
    </div>
  );
}
