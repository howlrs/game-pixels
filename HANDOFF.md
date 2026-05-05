# HANDOFF (2026-05-06、β11.0 リリース時点)

ピクセルズ (汎用ノノグラム / ピクチャーロジック Web アプリ) の引き継ぎ資料。

## 現在の状態

- リポジトリ: https://github.com/howlrs/game-pixels
- ローカル: `/home/o9oem/workspace/mine/temp/mario-pixel` (旧名のまま、リネームは保留)
- ブランチ: `main` (working tree clean)
- 最新タグ: `β11.0` (BGM 実装)
- ライセンス: MIT
- 公開アカウント: howlrs (sharebook.amazon@gmail.com)

## ジャンル転換について

旧仕様 (Round 1〜4) は 2D サイドスクロール プラットフォーマー (旧コード名: マリオピクセル) として MVP α (旧タグ v0.5.0-mvp-alpha) まで完成していたが、Round 5 でジャンルを **汎用ノノグラム** に全面転換 (任天堂 IP は使用しない)。新コードネーム: **ピクセルズ** (`pixels`)。GitHub リポ名は `game-pixels` のまま。旧プラットフォーマー仕様の全タグ (v0.1〜v0.5) は Round 5 で削除済 (混乱回避)。

## バージョン履歴

| Tag | 内容 |
|---|---|
| `v0.6.0-pixels-spec` | Round 5 = 仕様確定 (docs 全面書き直し) |
| `round1` 〜 `round7` | Round 6/7 = 旧コード削除 + MVP 実装 + パズル QA 整備 |
| `β2.0` | HUD レイアウト分離 / SE / 共有 / 設定モーダル |
| `β3.0` | ライン完了表示 / reduce-motion / 進捗% |
| `β4.0` | ヘルプモーダル / ハイコントラスト |
| `β5.0` | Undo / Redo |
| `β6.0` | 動的 canvas 解像度 / クリアマーク復元 |
| `β7.0` | 一時停止 (visibility 自動 paused) |
| `β8.0` | Undo/Redo 履歴を autoSave に統合 + autoSave バグ修正 |
| `β9.0` | 画像→パズル変換パイプ (sharp 導入) |
| `β10.0` | ズーム+パン UI |
| `β11.0` | BGM (WebAudio 自前合成 / chiptune アンビエント) |

## 累積成果 (β2.0 → β11.0)

- 21 PRs 自動マージ / 11 タグリリース
- 50+ Gemini Pro review items 反映
- パズル 21 件全 unique + logically solvable (5×5: 3, 10×10: 8, 15×15: 7, 25×25: 3)
- bundle precache ~716 KiB (BGM はコード生成で +5 KiB のみ)

## アーキテクチャ概要

```
src/
  audio/       — synth.ts (SE), bgm.ts (β11.0 chiptune BGM), store, mount
  core/        — board, save (Valibot), puzzle ロード
  game/        — Zustand store (board / marks / cursor / drag / history / viewport)
  input/       — grid-input.ts (Mouse/Touch/Keyboard/Wheel/ピンチ)
  platform/    — モバイル判定, body 属性 (reduceMotion / highContrast)
  qa/          — line-solver / board-solver / metrics (CI で全パズル検証)
  render/      — Pixi.js v8 mount + grid (bgRoot/boardRoot 分離 / viewport 適用)
  save/        — auto-save (debounce + visibility flush)
  ui/          — App, Hud, PuzzleSelect, SettingsModal, HelpModal, ResultsPage,
                 ClearBanner, ResumeGate, TapToStartGate, GameView, ModeButtons
```

## CI / 品質

- `.github/workflows/ci.yml`: build-test + validate-puzzles の 2 ジョブ (timeout 5 min)
- `bun run validate-puzzles`: 全パズルを QA で検証 (一意性 + 論理可解性 + 可視性 + 対称性)
- `bun scripts/build-puzzles.mjs`: `.grid` (ASCII art) → `.json` 自動生成
- `bun scripts/build-index.mjs`: index.json 自動生成
- 上記の差分が無いか CI で diff チェック

## 開発ワークフロー (継続中の規律)

1. ユーザー指示 / `<<autonomous-loop-dynamic>>` で各 PR 着手
2. 設計時に Gemini Pro deep でレビュー (`~/.claude/hooks/gemini-review.sh deep --pro`)
3. 実装 → typecheck + test + build + smoke (Playwright) で検証
4. CSS 変更を伴う場合は Gemini Pro review 必須 (memory: feedback_css_gemini_review.md)
5. PR 作成 → CI 通過 → squash merge (branch 自動削除)
6. 区切りで annotated タグ + GitHub Release (prerelease)
7. SurrealDB output_log に記録 (tags: pixels + beta番号 + topic)

## 次セッションの開始手順

```bash
cd /home/o9oem/workspace/mine/temp/mario-pixel
git checkout main && git pull --ff-only
git tag -l 'β*'                  # β11.1 (本資料更新タグ) まで確認
gh pr list --state open          # 未マージ PR 確認

# 過去知見の呼び戻し
/home/o9oem/workspace/surreal-query.sh --knowledge-search --tags "pixels,nonogram" --limit 10 --preview-only
/home/o9oem/workspace/surreal-query.sh "SELECT title, output_type, tags, created_at FROM output_log WHERE tags CONTAINSANY ['pixels','beta10','beta11'] ORDER BY created_at DESC LIMIT 10"
```

## 次フェーズ候補 (β12.0)

| 候補 | Gemini 評価 | 備考 |
|------|------------|------|
| テーマ複数選択 (季節 / カラーパレット) | 価値3 / コスト3 / リスク1 | UX 改善 |
| 真画像素材で新パズル | 価値4 / コスト5 / リスク5 | image-to-puzzle で写真ベース |
| 多言語対応 (i18n) | 価値4 / コスト3 / リスク2 | i18next 既に依存 |
| BGM 2 曲目以降 | 価値2 / コスト1 / リスク1 | 難度別 / カテゴリ別 |

## 環境メモ

- WSL2 Ubuntu Noble + SurrealDB (agents/agents) 自動起動
- Bun: ~/.bun/bin/bun (1.3.13、PATH 追加済)
- Playwright: ~/.cache/ms-playwright (chromium-1217)
- Gemini レビュー: `~/.claude/hooks/gemini-review.sh`
  - flash-lite (qa, review): 軽量レビュー
  - pro (deep, --pro): 深掘り討議
  - issue: Issue 起票前レビュー
- 旧プラットフォーマー仕様は git log で参照可能 (`git log --all --grep "マリオピクセル"`)

## ブランチ運用ルール (継続)

- 各 PR ごとに `feat/<topic>` または `docs/<topic>` のトピックブランチ
- PR で main に squash merge + branch 自動削除
- main タグは `βX.Y[.Z]` 形式 (β11.0 / β11.1 等)
- Gemini レビュー必須通過 (Issue 起票前 / 設計時 / PR 前)
- `^/~` 禁止、依存追加は `bun add <pkg>@<version>` で絶対指定
- `bun.lock` (Bun 1.3+ の text 形式) を Git 管理

## MVP 仕様 (12 論点 final、Round 5 で確定)

| # | 論点 | 確定仕様 |
|---|---|---|
| 1 | セル状態 | 三値 (空 / 塗 / ×) + 形状区別 |
| 2 | ヒント | パズル JSON に事前計算済の行/列ヒント配列を埋め込み |
| 3 | 解の一意性 | パズル生成時にツール側で保証 + CI 強制 |
| 4 | ペナルティ | MVP はなし、経過時間表示のみ |
| 5 | ヒント補助 | 手動マーク (タップで取り消し線) |
| 6 | 入力 | PC: 左塗/右× / スマホ: モード切替ボタン / Undo+Redo (β5.0 で追加) |
| 7 | 盤面サイズ | 5×5 / 10×10 / 15×15 / 25×25 (25×25 はズーム+パン UI 推奨) |
| 8 | データ形式 | JSON (2D 配列 + ヒント事前計算済 + メタ) |
| 9 | セーブ | LocalStorage + debounce + Undo/Redo 履歴統合 (β8.0) |
| 10 | 演出 | 塗りは即時、クリア時は塗られたセルが波状回転アニメ |
| 11 | a11y | DOM ARIA + キーボード操作 + reduceMotion + highContrast (WCAG AAA) |
| 12 | クロスデバイス | レスポンシブ + ズーム+パン UI (β10.0) |

## 解決済 (元・未決事項)

`docs/99_open-questions.md` に記載されていた未決事項のうち以下は解決:
- BGM → β11.0 で WebAudio 自前合成 chiptune アンビエント実装
- パズル絵柄 → 21 件 (5×5: 3, 10×10: 8, 15×15: 7, 25×25: 3) 全 unique + logically solvable
- 25×25 への対応 → β10.0 ズーム+パン UI で達成

未解決の主項目: i18n / Hard モード / UGC / Canvas a11y / 自動グレーアウト
