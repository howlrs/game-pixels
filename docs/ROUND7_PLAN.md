# Round 7 実装計画 — 結果ページ + 演出 + QA 機構 + 複雑パズル

ユーザー要望 (2026-05-05):

1. **空白ページ遷移バグ**: クリア後の自動遷移先で「何も無いページ」に見える
2. **総評ページ**: クリア後に他の作品一覧 / 次レベル一覧を見られる「結果ページ」が欲しい
3. **クリア時セル回転アニメ**: ピクセルを回転させて満足度を高める演出
4. **QA 機構 + 複雑パズル**: 座標を正確にユーザーへ提供するための品質保証 (一意性 / 論理可解性 / 可視性 / 対称性) + 画像→ピクセル変換 + 大型パズル

## 調査結果 — 「空白ページ」の真因仮説

Playwright (chromium / WebGL) で実機検証したところ、`puzzle-select` 画面は正しく表示される (3 ボタン描画 / pageerror 無し)。

| 仮説 | 根拠 | 対応 |
|-----|------|------|
| WebGPU 障害でレイアウトが崩れた | 環境固有 | (副次) 防御コード追加 |
| ブラウザキャッシュで PR #32 前 build が残った | hard reload で解消するタイプ | (副次) cache-busting |
| **画面の大半が黒で、左上に小さくボタンが出るだけなので「空白」と感じる** | 実 screenshot で確認 (1024x768 中、UI は左上 ~480x180 のみ) | **要望 ② の ResultsPage で根本解消** |

→ ユーザーが体感した「空白」は、**正常表示時の視覚的貧弱さ** が主因と判定。Round 7-A の ResultsPage で根本解消する。

## PR 分割案 (5 PR)

### PR-A (Round 7-α): ResultsPage + 空白対策
**目標**: クリア後にリッチな結果ページを表示し、「空白に見える」体験を解消する。

実装:
- `phase` に `'results'` を追加 (`'cleared'` の次の遷移先)
- `ClearOverlay` を 1.5 秒 (現状 3 秒から短縮) で `'results'` へ
- `ResultsPage` 新規コンポーネント (フルスクリーン):
  - クリア作品プレビュー (Pixi.js mini canvas またはスナップショット PNG)
  - クリアタイム / ベストタイム比較
  - 同カテゴリの他パズル一覧 (リトライ可能)
  - 「次のレベル」誘導 (5x5 → 10x10 / 10x10 → 15x15)
  - 「パズル選択へ戻る」ボタン
- `PuzzleSelect` 強化: 画面センタリング / カテゴリヘッダ視認性向上 / モバイル対応
- 影響ファイル: `src/game/store.ts`, `src/ui/App.tsx`, `src/ui/ClearOverlay.tsx`, `src/ui/ResultsPage.tsx` (新規), `src/ui/PuzzleSelect.tsx`, `index.html` の `<style>` 追加, `docs/97_responsive-crossdevice.md`
- **CSS は Gemini Pro レビューを必ず通す**

### PR-B (Round 7-β): クリア時セル回転アニメ
**目標**: クリアの達成感を視覚的に強化する。

実装:
- `grid.ts` に `playClearAnimation(cells, onComplete)` を追加
- 塗りセルが波状 (左→右 / 上→下) に 360° 回転 (約 1.2 秒で完了)
- アニメ完了後に `phase` を `'results'` へ自動遷移 (PR-A の遷移を上書き)
- `prefers-reduced-motion: reduce` の場合はアニメ skip
- 影響ファイル: `src/render/grid.ts`, `src/render/mount.ts`, `src/ui/App.tsx`

### PR-C (Round 7-γ): QA 機構 (品質保証スイート)
**目標**: 「座標を正確にユーザーへ提供する」ためのソルバー / 検証ツールチェーン。

実装:
- `src/qa/uniqueness.ts` — 完全 backtracking solver (一意解判定)
- `src/qa/logical-solver.ts` — line solver (overlap / constraint propagation), 推論段数 (= 難易度) を返す
- `src/qa/visibility.ts` — connected components / bounding box / pixel ratio 計算
- `src/qa/symmetry.ts` — 横対称 / 縦対称 / 点対称スコア (0.0-1.0)
- `scripts/validate-puzzle.mjs` — 既存 3 puzzles を新ソルバーで検証 (CI 用)
- `tests/qa/*.test.ts` — 各ソルバーのユニットテスト
- 影響ファイル: 上記新規 + `package.json` (test:qa script), `docs/QA_SUITE.md` (新規)

### PR-D (Round 7-δ): 画像→ピクセル変換 + 10x10 パズル
**目標**: 画像から自動生成して、より複雑なパズルを提供する。

実装:
- `scripts/image-to-puzzle.mjs` — PNG/JPEG を読み込み、輝度 → 2値 → ヒント生成
- 10x10 puzzles × 8 (動物 / 食べ物 / 記号系) を generate
- 各 puzzle を PR-C の QA 機構で検証 (一意性 + 論理可解性 + 可視性 ≥ 0.4 + 対称性スコア記録)
- `public/puzzles/index.json` 更新
- 影響ファイル: 上記新規 + `public/puzzles/10x10/*.json` (8 個)

### PR-E (Round 7-ε): 15x15 パズル + CI バリデーション
**目標**: 大型パズルで挑戦性を提供 + CI で品質を担保。

実装:
- 15x15 puzzles × 7 を generate (PR-D の image-to-puzzle ベース)
- `.github/workflows/validate-puzzles.yml` — push 時に全 puzzle を validate-puzzle.mjs で検証
- 失敗時 PR ブロック
- 影響ファイル: 上記新規 + `public/puzzles/15x15/*.json` (7 個)

## 進行順序

1. PR-A (最優先 — ユーザー体感に直結)
2. PR-B (PR-A merge 後 — UX 強化)
3. PR-C (独立 — QA 基盤)
4. PR-D, PR-E (PR-C merge 後 — QA を使ったコンテンツ拡充)

## CSS / レイアウト変更ルール (新規)

ユーザー指示 (2026-05-05): 「CSS関連はGeminiが強い。レビューをこまめに受けるように」
→ PR-A / PR-B のように CSS / DOM 構造を変える PR は、**diff を `gemini-review.sh review --pro` に必ず通してから commit する**。深掘り必要なら `deep`。

## Gemini Pro deep レビュー反映 (2026-05-05)

本計画書を `gemini-review.sh deep` に投入し、以下の指摘を反映する。

### 🐞 PR-A 反映
- **A-1 (改善 1)**: ResultsPage の作品プレビューは Pixi.js Canvas スナップショットではなく、**SVG または DOM ベースのミニチュアグリッド** (React コンポーネント) で描画する。理由: `preserveDrawingBuffer: true` が必要 / 再起動コスト / モバイル負荷。
- **A-2 (改善 2)**: モバイル (縦長) / タブレットでコンテンツが溢れないよう、Flexbox + Grid の **レスポンシブなスクロール領域** を設計。`overflow-y: auto` + 高さ計算は `svh` ベース。

### 🐞 PR-B 反映
- **B-1 (バグ 3)**: `prefers-reduced-motion: reduce` でアニメ skip した場合も、`onComplete` を **同期的に発火** して `phase = 'results'` 遷移を確実にする。テストでライフサイクルを検証。

### 🐞 PR-C 反映
- **C-1 (バグ 1)**: 一意性 backtracking solver には**タイムアウト + 最大探索ステップ数**を必ず設ける (15x15 で計算爆発回避)。**Line solver で先に解き、未確定セルのみ backtrack** するハイブリッド方式を採用。
- **C-2 (改善 3)**: CI workflow に `timeout-minutes: 5` を必ず設定。

### 🐞 PR-D 反映
- **D-1 (バグ 2)**: 画像→パズル変換は単純 2 値化だけでは「論理的に解ける」確率が低いため、**自動調整 (フリップ) アルゴリズム** を組み込む。または手動修正フローを別途用意。
- **D-2 (セキュリティ 1)**: 画像処理ライブラリ (sharp 等) の DoS 対策として、**入力サイズ ≤ 2MB / 解像度 ≤ 1024×1024** をスクリプト冒頭で弾く。

### 🛡 PR-A 反映 (セキュリティ)
- **S-1 (セキュリティ 2)**: 将来パズル JSON に作者名等が入る可能性を考慮し、**Valibot Schema での文字列長制限 + サニタイズ** を puzzle.ts に追加 (Round 7-A or 別 PR)。WebGL 文字描画は当面行わない (Pixi.js Text は React 側で代替)。

### スコープ調整
- PR-A: 「ResultsPage プレビュー = SVG/DOM」追記、レスポンシブ設計の明記
- PR-B: アニメ skip テストを追加
- PR-C: ハイブリッド solver 方針 + タイムアウト追記、CI timeout-minutes 追記
- PR-D: 自動 flip アルゴリズム or 手動修正フロー、画像サイズ制限
