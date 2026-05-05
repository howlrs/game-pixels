// β4.0-α: キーボードショートカット + 操作ヘルプ Modal。
// SettingsModal と同じパターン (createPortal / focus trap / body scroll lock)。
//
// 開閉:
// - 「?」HUD ボタン
// - グローバル「?」キー (Shift+/) — INPUT/TEXTAREA フォーカス中は無視
// - 閉じる: Esc / 背景 / × / 閉じるボタン

import { Fragment, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

const SHORTCUT_GROUPS: { title: string; rows: ShortcutRow[] }[] = [
  {
    title: 'カーソル移動',
    rows: [
      { keys: ['←'], description: '左へ' },
      { keys: ['→'], description: '右へ' },
      { keys: ['↑'], description: '上へ' },
      { keys: ['↓'], description: '下へ' },
    ],
  },
  {
    title: 'セル操作',
    rows: [
      { keys: ['Z', 'Space'], description: '塗りトグル (同セル再押下で空)' },
      { keys: ['X'], description: '× 印トグル' },
      { keys: ['C'], description: '消す' },
    ],
  },
  {
    title: 'マウス',
    rows: [
      { keys: ['左クリック'], description: '塗り (ドラッグで連続塗り)' },
      { keys: ['右クリック'], description: '× 印 (ドラッグで連続)' },
    ],
  },
  {
    title: 'タッチ',
    rows: [
      { keys: ['タップ'], description: '現在のモードに応じて塗/×/消' },
      { keys: ['長押し+ドラッグ'], description: 'ドラッグ起点と同じ状態のセルだけ操作' },
    ],
  },
  {
    title: 'その他',
    rows: [
      { keys: ['?'], description: 'このヘルプを開く / 閉じる' },
      { keys: ['Esc'], description: 'ヘルプ・設定を閉じる' },
    ],
  },
];

export function HelpModal({ open, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const raf = requestAnimationFrame(() => closeButtonRef.current?.focus());

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
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
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [open, onClose]);

  if (!open) return null;

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
        className="settings-modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <header className="settings-header">
          <h2 id="help-title">ヘルプ / ショートカット</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="settings-close"
            aria-label="ヘルプを閉じる"
          >
            ×
          </button>
        </header>

        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="settings-section help-section">
            <h3>{group.title}</h3>
            <ul className="help-list">
              {group.rows.map((row) => (
                <li key={row.description} className="help-row">
                  <span className="help-keys">
                    {row.keys.map((k, i) => (
                      <Fragment key={k}>
                        <span className="help-key-chip">{k}</span>
                        {i < row.keys.length - 1 && <span className="help-key-sep">/</span>}
                      </Fragment>
                    ))}
                  </span>
                  <span className="help-desc">{row.description}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

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
