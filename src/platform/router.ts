// β12.0-α: 軽量ルーティング (React Router 不要、URL ↔ phase の最小実装)
//
// URL pattern:
//   /                            → 'tap-to-start'
//   /puzzles/                    → 'puzzle-select' (全カテゴリ index)
//   /puzzles/<category>/         → 'puzzle-select' (カテゴリ index、現状はフィルタ未対応で全表示)
//   /puzzles/<category>/<id>/    → 'playing' (該当パズルを直接ロード)
//
// SSG で各 path に prerender HTML が配置されている前提。クライアントは window.__PIXELS_INITIAL_PATH__ か
// window.location.pathname を読んで起動時に該当パズルをロードする。
//
// SPA 内でパズル選択 → 開始時は history.pushState で URL を書き換え (ブックマーク・共有可能に)。

const PUZZLE_PATH_RE = /^\/puzzles\/(\d{1,3}x\d{1,3})\/([a-z0-9][a-z0-9-]{0,63})\/?$/;
const CATEGORY_PATH_RE = /^\/puzzles\/(\d{1,3}x\d{1,3})\/?$/;
const PUZZLES_INDEX_RE = /^\/puzzles\/?$/;
const ROOT_RE = /^\/$/;

export type RoutedTarget =
  | { kind: 'top' }
  | { kind: 'puzzles-index' }
  | { kind: 'category-index'; category: string }
  | { kind: 'puzzle'; category: string; id: string };

/**
 * 起動時パスから target を解析。SSG された path が前提なので未マッチなら 'top' に fallback。
 */
export function parsePath(path: string): RoutedTarget {
  if (ROOT_RE.test(path)) return { kind: 'top' };
  if (PUZZLES_INDEX_RE.test(path)) return { kind: 'puzzles-index' };
  const cat = path.match(CATEGORY_PATH_RE);
  if (cat) return { kind: 'category-index', category: cat[1]! };
  const m = path.match(PUZZLE_PATH_RE);
  if (m) return { kind: 'puzzle', category: m[1]!, id: m[2]! };
  return { kind: 'top' };
}

/** 起動時に SSG が埋め込んだ initial path、無ければ location.pathname */
export function getInitialPath(): string {
  if (typeof window === 'undefined') return '/';
  const injected = (window as unknown as { __PIXELS_INITIAL_PATH__?: string }).__PIXELS_INITIAL_PATH__;
  if (typeof injected === 'string' && injected.startsWith('/')) return injected;
  return window.location.pathname || '/';
}

/** target → path 文字列 */
export function targetToPath(target: RoutedTarget): string {
  switch (target.kind) {
    case 'top':
      return '/';
    case 'puzzles-index':
      return '/puzzles/';
    case 'category-index':
      return `/puzzles/${target.category}/`;
    case 'puzzle':
      return `/puzzles/${target.category}/${target.id}/`;
  }
}

/**
 * URL を書き換え (pushState)。同 path なら no-op。
 * SPA 遷移用 (puzzle-select → playing 等)。
 */
export function navigate(target: RoutedTarget): void {
  if (typeof window === 'undefined') return;
  const path = targetToPath(target);
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
}
