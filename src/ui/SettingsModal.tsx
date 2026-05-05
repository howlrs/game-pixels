// β2.0-δ: 設定モーダル — 音量 / a11y を編集 + LocalStorage に即保存。
//
// 設計:
// - HUD の歯車ボタンから開く / Esc または背景クリック / × ボタンで閉じる
// - 即時反映: スライダー操作で updateSettings (LocalStorage に即保存)
// - a11y: role="dialog" / aria-modal="true" / フォーカストラップ + 復帰 (Gemini 指摘 1, 2)
// - body スクロールロック (Gemini 指摘 3)
// - createPortal で body 直下 mount (Gemini 指摘 6 / stacking 安定)
//
// β3.0-β: 設定変更を実エフェクトに反映
// - audio: setVolume を即呼ぶ (synth に反映)
// - a11y.reduceMotion: updateReduceMotion で body 属性即反映 (CSS / grid.ts アニメ制御)

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setVolume } from '@audio/index.ts';
import { updateHighContrast, updateReduceMotion } from '@platform/index.ts';
import { getSavedData, updateSettings } from '@save/index.ts';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const initial = getSavedData().settings;
  const [master, setMaster] = useState(() => initial.audio.master);
  const [se, setSe] = useState(() => initial.audio.se);
  const [muteOnBlur, setMuteOnBlur] = useState(() => initial.audio.muteOnBlur);
  const [reduceMotion, setReduceMotion] = useState(() => initial.a11y.reduceMotion);
  const [highContrast, setHighContrast] = useState(() => initial.a11y.highContrast);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // open 時: フォーカス復帰用に開く前の active 要素を保存 + 閉じボタンへ初期フォーカス
  // フォーカストラップ + Esc ハンドラ + body スクロールロック (Gemini 指摘 1/2/3)
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const raf = requestAnimationFrame(() => closeButtonRef.current?.focus());

    // body スクロールロック
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // フォーカストラップ: dialog 内のフォーカス可能要素を循環
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // フォーカス復帰
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [open, onClose]);

  if (!open) return null;

  function commitAudio(partial: Partial<{ master: number; se: number; muteOnBlur: boolean }>) {
    updateSettings({ audio: partial });
    // β3.0-β: audio synth に即反映
    if (typeof partial.master === 'number' || typeof partial.se === 'number') {
      const vol: { master?: number; se?: number } = {};
      if (typeof partial.master === 'number') vol.master = partial.master;
      if (typeof partial.se === 'number') vol.se = partial.se;
      setVolume(vol);
    }
  }

  function commitA11y(partial: Partial<{ reduceMotion: boolean; highContrast: boolean }>) {
    updateSettings({ a11y: partial });
    // β3.0-β: reduceMotion を body 属性即反映
    if (typeof partial.reduceMotion === 'boolean') {
      updateReduceMotion(partial.reduceMotion);
    }
    // β4.0-β: highContrast を body 属性即反映 + Pixi.js 盤面再描画 (mount.ts subscribe で自動)
    if (typeof partial.highContrast === 'boolean') {
      updateHighContrast(partial.highContrast);
    }
  }

  return createPortal(
    <div
      className="settings-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <h2 id="settings-title">設定</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="settings-close"
            aria-label="設定を閉じる"
          >
            ×
          </button>
        </header>

        <section className="settings-section">
          <h3>音響</h3>
          <label className="settings-row">
            <span>マスター音量</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(master * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setMaster(v);
                commitAudio({ master: v });
              }}
            />
            <output>{Math.round(master * 100)}</output>
          </label>
          <label className="settings-row">
            <span>効果音</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(se * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setSe(v);
                commitAudio({ se: v });
              }}
            />
            <output>{Math.round(se * 100)}</output>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={muteOnBlur}
              onChange={(e) => {
                setMuteOnBlur(e.target.checked);
                commitAudio({ muteOnBlur: e.target.checked });
              }}
            />
            <span>バックグラウンド時にミュート</span>
          </label>
        </section>

        <section className="settings-section">
          <h3>アクセシビリティ</h3>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(e) => {
                setReduceMotion(e.target.checked);
                commitA11y({ reduceMotion: e.target.checked });
              }}
            />
            <span>アニメーションを減らす</span>
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(e) => {
                setHighContrast(e.target.checked);
                commitA11y({ highContrast: e.target.checked });
              }}
            />
            <span>ハイコントラスト</span>
          </label>
        </section>

        <footer className="settings-footer">
          <button type="button" onClick={onClose} className="primary">
            閉じる
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
