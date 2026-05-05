# HANDOFF (2026-05-05、Round 5 ジャンル転換版)

ピクセルズ (汎用ノノグラム / ピクチャーロジック Web アプリ) の事前調査セッション引き継ぎ資料。

## ジャンル転換について

旧仕様 (Round 1〜4) は 2D サイドスクロール プラットフォーマー (旧コード名: マリオピクセル) として MVP α (旧タグ v0.5.0-mvp-alpha) まで完成していたが、Round 5 でユーザー要望によりジャンルを **汎用ノノグラム** に全面転換。任天堂 IP は使用しない。

新コードネーム: **ピクセルズ** (`pixels`)。GitHub リポ名は `game-pixels` のまま。
旧プラットフォーマー仕様の全タグ (v0.1〜v0.5) は Round 5 で削除済 (混乱回避)。

## 現在の状態

- リポジトリ: https://github.com/howlrs/game-pixels
- ローカル: `/home/o9oem/workspace/mine/temp/mario-pixel` (Round 6 で `game-pixels/` にリネーム予定)
- ブランチ: `main` + `docs/round5/pixels-spec` (本 Round の作業ブランチ)
- タグ: (旧タグ全削除済、Round 5 完了で `v0.6.0-pixels-spec` 付与予定)
- ライセンス: MIT
- 公開アカウント: howlrs (sharebook.amazon@gmail.com)

## Round 5 で完了済 (本セッション)

1. **仕様調査** — ノノグラム標準仕様 12 論点を Web + Gemini Pro deep で整理
2. **独立妥当性検証** — Gemini Pro deep で 12 論点を再評価、致命指摘 2 + 軽微 4 を反映して MVP final 仕様確定
3. **旧タグ全削除** — v0.1.0-draft / v0.2.0-docs-round1 / v0.3.0-docs-round2 / v0.4.0-skeleton / v0.5.0-mvp-alpha を local + remote から削除
4. **コード内マリオ表記置換** — package.json / index.html / vite.config.ts / src/ui/TapToStartGate.tsx / src/render/mount.ts / scripts/*.mjs
5. **docs 全面書き直し** — 19 章のうちジャンル特有 9 章 (§20/§30/§40/§50/§60/§70/§80/§90/§95) を全置換 + 残り章のマリオ表記除去 + 用語集 (§00_glossary.md) 新設
6. **Round 5 Issue 起票** — #29
7. **SurrealDB 記録** — output_log (調査結果) + review_log (独立検証)

## 次セッションの開始手順

```bash
cd /home/o9oem/workspace/mine/temp/mario-pixel  # Round 6 でリネーム後は game-pixels/
git checkout main && git pull --ff-only
git tag -l                       # v0.6.0-pixels-spec まで確認
gh issue list --state open       # 未着手 Issue 一覧 (Round 6 用に新 Issue 起票予定)
```

過去知見の呼び戻し:
```bash
/home/o9oem/workspace/surreal-query.sh --knowledge-search --tags "pixels,nonogram" --limit 10 --preview-only
/home/o9oem/workspace/surreal-query.sh "SELECT title, output_type, tags, created_at FROM output_log WHERE tags CONTAINSANY ['pixels','nonogram','round5'] ORDER BY created_at DESC LIMIT 10"
/home/o9oem/workspace/surreal-query.sh "SELECT review_mode, model, target, tags, created_at FROM review_log WHERE tags CONTAINSANY ['pixels','nonogram','round5'] ORDER BY created_at DESC LIMIT 20"
```

## 次にやるべきこと (Round 6 = 実装転換)

1. **旧コード削除** — Round 6 ブランチで:
   - src/core/world.ts (bitECS) / src/core/loop.ts (固定タイムステップ) / src/core/coords.ts (subpixel) / src/core/physics/ 全部 / src/core/input/ (旧物理操作部分)
   - src/game/systems/ 全部 (physics / render-sync 等の物理システム)
   - public/stages/1-1.json (旧プラットフォーマーステージ)
   - 関連テストファイル
2. **ピクセルズ MVP 実装**:
   - src/core/board.ts (盤面モデル §20)
   - src/core/clue.ts (ヒント生成 §30)
   - src/game/store.ts (Zustand store §94.2.1)
   - src/render/grid.ts (盤面描画 §91)
   - src/input/mouse.ts / touch.ts / keyboard.ts (入力 §90)
   - src/save/local-storage.ts (LocalStorage §93)
   - src/ui/PuzzleSelect.tsx / Hud.tsx / ModeButtons.tsx (React UI)
3. **パズル 20 個生成** — `scripts/generate-puzzles.mjs` で 5×5 / 10×10 / 15×15 を生成、解の一意性検証
4. **ローカルディレクトリリネーム** — `mario-pixel/` → `game-pixels/` (`git mv` で履歴維持)
5. **タグ付与** — Round 6 完了で `v0.7.0-pixels-mvp`

## ブランチ運用ルール (継続)

- 各 Issue ごとに `docs/<topic>` または `feat/<topic>` のトピックブランチ
- PR で main に merge (squash, branch 自動削除)
- main タグは `vX.Y.Z-<phase>` 形式
- Gemini レビュー (`~/.claude/hooks/gemini-review.sh`) を Issue 起票前 / PR 前に必須通過
- `^/~` 禁止、依存追加は `bun add <pkg>@<version>` で絶対指定
- `bun.lock` (Bun 1.3+ の text 形式) を Git 管理

## MVP 仕様 (12 論点 final、Round 5 で確定)

| # | 論点 | 確定仕様 |
|---|---|---|
| 1 | セル状態 | 三値 (空 / 塗 / ×) + 形状区別 |
| 2 | ヒント | パズル JSON に事前計算済の行/列ヒント配列を埋め込み |
| 3 | 解の一意性 | パズル生成時にツール側で保証 |
| 4 | ペナルティ | MVP はなし、経過時間表示のみ |
| 5 | ヒント補助 | 手動マーク (タップで取り消し線) |
| 6 | 入力 | PC: 左塗/右× / スマホ: モード切替ボタン / Undo なし |
| 7 | 盤面サイズ | スマホ 5×5〜10×10、PC+タブレット 5×5〜15×15 |
| 8 | データ形式 | JSON (2D 配列 + ヒント事前計算済 + メタ) |
| 9 | セーブ | LocalStorage + debounce |
| 10 | 演出 | 塗りは即時、クリア時は塗られたセルが色変化アニメ |
| 11 | a11y | DOM のみ ARIA + キーボード対応、Canvas 内 a11y は v1.1 |
| 12 | クロスデバイス | レスポンシブ、スマホ ≤10×10、タッチ ≥44×44px |

## 未決事項

`docs/99_open-questions.md` の §19.1 を参照:
- パズル 20 個の絵柄
- BGM 1 種類のみ MVP
- i18n は日本語のみ MVP
- iOS Safari 7 日無アクセス削除
- Hard モード / UGC / Canvas a11y / Undo / 自動グレーアウト / 大盤面 / カラー — 全て v1.1+

## 環境メモ

- WSL2 Ubuntu Noble + SurrealDB (agents/agents) 自動起動
- Bun: ~/.bun/bin/bun (1.3.13、PATH 追加済)
- Playwright: ~/.cache/ms-playwright (chromium-1217)
- Gemini レビュー: `~/.claude/hooks/gemini-review.sh`
  - flash-lite (qa, review): 軽量レビュー
  - pro (deep, --pro): 深掘り討議
  - issue: Issue 起票前レビュー
- 旧プラットフォーマー仕様の参照は git log で可能 (`git log --all --grep "マリオピクセル"`)
