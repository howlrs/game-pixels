# QA Suite — ピクセルズ品質保証機構 (Round 7-C)

ノノグラムパズルを「production レベル」で配信するために、自動生成・既存問わず
すべてのパズルを 4 つの観点から検証する。PR-D / PR-E の自動生成パイプラインで
篩い分けに使う。

## 4 つの検証観点

| 観点 | 何を見るか | 実装 |
|-----|-----------|------|
| **一意性** | 解が 1 つだけか | `src/qa/board-solver.ts` (hybrid: line solver + bounded backtrack) |
| **論理可解性** | line solver (overlap 推論) だけで解けるか (= no-guess) | `src/qa/line-solver.ts` 反復 |
| **可視性** | 絵として見やすいか (塗り比率 / 連結成分 / bbox 充填率) | `src/qa/metrics.ts` |
| **対称性** | 横/縦/点対称スコア | `src/qa/metrics.ts` |

## 公開 API

```typescript
import { assessSolution, assessPuzzle, type QaReport } from '@qa/index.ts';

// solution (2D 配列) を評価
const report = assessSolution(solution, {
  pass: { requireUnique: true, minPixelRatio: 0.15, maxComponents: 4 },
  solver: { maxSteps: 100_000, timeoutMs: 5_000 },
});

if (report.pass) console.log('OK');
else console.log('NG:', report.reasons);
```

## CLI

```bash
# 全パズル検証 (public/puzzles/ 以下を再帰)
bun run validate-puzzles

# 個別ファイル
bun scripts/validate-puzzle.mjs public/puzzles/5x5/heart.json

# 失敗があれば exit code 1 (CI バリデーション用)
```

## 画像→パズル CLI (β9.0-α 以降)

`image-to-puzzle.mjs` は以下の入力形式をサポート:

| 拡張子 | 形式 | 用途 |
|-------|------|------|
| `.json` | 2D `0/1` 配列 (`{ "solution": [[0,1,...], ...] }`) | 既存セーブ形式の変換 |
| `.grid` / `.txt` | ASCII art (`#` = 塗、`.` = 空) | 手描きで素早く設計 |
| `.png` / `.jpg` / `.jpeg` / `.webp` | 画像 (sharp で grayscale → 2 値化) | 既存画像から自動生成 |

### 使い方

```bash
# 画像ファイルからパズル生成 (10x10)
bun scripts/image-to-puzzle.mjs path/to/image.png \
  --id my-cat --title 'うちのねこ' --width 10 --height 10 \
  --category 10x10 --difficulty medium --description '猫の写真から' \
  --out tools/puzzle-specs/sample/my-cat.json
```

### 画像入力時のパイプライン

1. **デコード**: `sharp(buf).grayscale().raw()` で 0..255 の輝度配列に変換
2. **2 値化**: 平均輝度をしきい値とし、**暗い (低輝度) 部分を塗 (1)** に変換
3. **リサイズ**: ブロック平均で `--width × --height` のターゲットサイズに縮小
4. **tryAutoFix**: QA で multiple → 差分セルを 1 つ flip → 再 QA (最大 8 回)
5. **QA 通過チェック**: 一意性 + 論理可解性 + 可視性 + 対称性

### 安全策

- 入力サイズ ≤ 2 MB
- 画像解像度 ≤ 1024 × 1024
- 1 行 ≤ 8 KB (ASCII art)
- `--out` は **project root 配下のみ許可** (パストラバーサル防止)
- `--width / --height` は 3..50 整数

### サンプル

```bash
# 円 (15x15) と矢印 (10x10) のサンプルを生成
bun scripts/sample-image-puzzles.mjs
# → tools/puzzle-specs/sample/{circle-15,arrow-10}.{png,json}
```

## アルゴリズム要点

### Line Solver (`solveLine`)

1 行 (or 1 列) のヒントと現在状態 (FILLED/EMPTY/UNKNOWN) から、
配置可能な全パターンを DP/backtrack で列挙し、

- 全パターンで FILLED → そのセルは確定 FILLED
- 全パターンで EMPTY → そのセルは確定 EMPTY
- 両方ある → UNKNOWN

を返す。矛盾時は `null`。

計算量: 行長 n, ブロック数 k で O(n^2 * k) 程度。15x15 で 225 行 * 5 ブロック程度なら
1 ms 未満。

### Board Solver (`solveBoard`) — Hybrid 戦略

> **Gemini Pro deep 指摘 (Round 7 計画 C-1)**: ピクロスのバックトラッキングは NP 完全。
> 15x15 で計算爆発を防ぐため必ずタイムアウト + ステップ数制限 + Hybrid 戦略を採用すること。

1. **Line propagation**: 全行・全列に line solver を反復適用 (進展なくなるまで)
2. 全マス確定 → 1 解確定。続けて backtrack で 2 解目を探す
3. 未確定マスがあれば、最初の UNKNOWN セルを選んで FILLED/EMPTY を試す → 再帰
4. 各分岐で再度 propagate
5. **Stop conditions** (二重防御):
   - `maxSteps` (デフォルト 100,000)
   - `timeoutMs` (デフォルト 5,000)
   - 2 解見つかったら early stop (`status: 'multiple'`)

戻り値:

```typescript
{
  status: 'unique' | 'multiple' | 'unsolvable' | 'timeout',
  sample?: (0 | 1)[][],       // 1 つ目の解
  alternative?: (0 | 1)[][],  // 2 つ目の解 (multiple のみ)
  logicallySolvable: boolean, // line solver だけで解けたか
  stats: { steps, elapsedMs, linePropagationRounds },
}
```

### Visibility Metrics (`computeVisibility`)

- `pixelRatio`: 塗りマス / 全マス (0.0-1.0)
- `components`: 4 連結 connected components 数 (BFS)
- `boundingBox`: 塗りマスを囲む最小矩形
- `fillsBounds`: bbox 内に占める塗り比率

### Symmetry Metrics (`computeSymmetry`)

- `horizontal`: 左右対称スコア (0.0-1.0)
- `vertical`: 上下対称スコア
- `point`: 180° 点対称スコア

各スコアは「対面セル同士が一致するセル比率」。

## 採用基準 (デフォルト)

| 基準 | デフォルト値 | 緩和 |
|-----|-------------|------|
| `requireUnique` | `true` | 一意解必須 |
| `requireLogicallySolvable` | `true` | no-guess パズル必須 |
| `minPixelRatio` | `0.15` | 薄すぎる絵を弾く |
| `maxPixelRatio` | `0.7` | 塗りすぎを弾く |
| `maxComponents` | `4` | 散らばりすぎを弾く |

`assessSolution(solution, { pass: {...} })` で個別緩和可能。

## パズル品質 (Round 7-E 完了時 2026-05-05 / 全 21 puzzle)

| カテゴリ | 件数 | すべて unique + logically solvable |
|---------|------|------------------------------|
| 5x5 | 3 | ✓ (ハート / ダイヤ / プラス) |
| 10x10 | 8 | ✓ (ねこ / いえ / ほし / きのこ / ハート(大) / かさ / ロケット / き) |
| 15x15 | 7 | ✓ (りんご / うさぎ / さかな / きりん / ぞう / かに / かたつむり) |
| 25x25 | 3 | ✓ (ちょう / しろ / ドラゴン) |

全 21 パズル合格。

## CI バリデーション (Round 7-E)

`.github/workflows/ci.yml` に validate-puzzles ジョブを追加 (timeout-minutes: 5)。
PR ごとに以下を強制:

1. `bun run validate-puzzles` で全パズルの QA 通過
2. `.grid` を編集後 `bun scripts/build-puzzles.mjs` で `.json` 再生成済か (diff チェック)
3. `bun scripts/build-index.mjs` で `index.json` 再生成済か (diff チェック)

任意のチェック失敗で CI fail。

## メタ定義の集約

`scripts/puzzle-meta.mjs` に `SIZES` / `META` / `ID_ORDER` / `durationFor` を集約。
`build-puzzles.mjs` と `build-index.mjs` が共通参照する (DRY 原則 / Gemini Pro deep 指摘 5)。
