# パズル拡張設計 (各サイズ 10 件以上化) — 2026-05-06

## 目的

既存 21 パズル (5x5: 3 / 10x10: 8 / 15x15: 7 / 25x25: 3) を **各サイズ 10 件以上** に拡張する。テーマ重複を避け、UX 向上 (バリエ感・コレクション感・サイズに応じた進行感) を狙う。

## 完了条件

1. **各サイズ最低 10 件 pass** (上限なし、QA pass したものは全採用)
2. **既存題材含めて重複なし**
3. **`bun scripts/validate-puzzle.mjs` exit 0** (全採用パズルが QA pass = 一意解 / 論理可解 / pixelRatio 0.15-0.7 / components ≤ 4)
4. **`bun run typecheck` exit 0**
5. **`bun run test` exit 0**
6. **`bun run build` (vite build + build:ssg) exit 0** (新パズル分の SSG / OG / sitemap が自動生成される)

## アーキテクチャ

### 既存パイプライン (10x10/15x15/25x25 で稼働中)

```
tools/puzzle-specs/<size>/<id>.grid (ASCII art: # 塗り / . 空)
        ↓ scripts/build-puzzles.mjs [<size>]
        ↓ (内部で image-to-puzzle.mjs を spawn → しきい値段階探索 + 最少 flip で一意解 QA を試行)
public/puzzles/<size>/<id>.json (meta + solution + clues)
        ↓ scripts/build-index.mjs
public/puzzles/index.json
        ↓ scripts/validate-puzzle.mjs (最終 QA: solver / visibility / symmetry)
```

### 5x5 統合 (新規)

5x5 はこれまで `SIZES` 対象外で手書き JSON 運用だった。今回パイプラインに乗せる:

1. `scripts/puzzle-meta.mjs`:
   - `SIZES = ['5x5', '10x10', '15x15', '25x25']`
   - `META` に 5x5 全件 (既存 3 + 新規) を登録
   - `durationFor('5x5') = 60` を追加
2. `tools/puzzle-specs/5x5/{heart,diamond,cross}.grid` を作成 (既存 JSON の solution から逆生成)
3. `bun scripts/build-puzzles.mjs 5x5` で再生成 → `public/puzzles/5x5/*.json` が META 経由で再生成される
   - 副作用: `image-to-puzzle.mjs` が `estimatedSolveSeconds = w*h*6` をハードコードしているため、5x5 全件は **150 秒** に統一される (heart 60→150 / diamond 90→150 / cross 60→150)。`durationFor('5x5')` は現在 import 元が無く dead code 気味だが META 一貫性のため追加する

### QA 基準 (`src/qa/index.ts`)

- `requireUnique: true` — 一意解必須
- `requireLogicallySolvable: true` — 論理ソルバーで完全に解ける (推測不要)
- `minPixelRatio: 0.15` / `maxPixelRatio: 0.7` — 塗りすぎ・空きすぎ防止
- `maxComponents: 4` — 散らばった絵を排除

## 題材リスト (テーマ別バランス・重複なし)

カテゴリ: 記号 / 食べ物 / 自然 / 動物 / 生活 / 乗り物 / ファンタジー。サイズが上がるほど題材を豪華に (記号 → 物体 → 動物 → 風景・ファンタジー)。

★ = 既存。新規候補は QA pass したものを全採用。

### 5x5 (既存 3 + 新規候補 9 → 計 12 候補、最低 10 採用目標)

シンプル記号・小物中心。易しさ + 達成感。

- ★ heart ハート (記号)
- ★ diamond ダイヤ (記号)
- ★ cross プラス (記号)
- arrow-up やじるし (記号)
- smile スマイル (生活)
- star-mini ほし (記号)
- circle まる (記号)
- key かぎ (生活)
- bolt いなずま (自然)
- letter-x ばつ (記号)
- square しかく (記号)
- note おんぷ (生活)

### 10x10 (既存 8 + 新規候補 7 → 計 15 候補、最低 10 採用目標)

具体物・親しみ系。バリエ重視。

- ★ cat / ★ house / ★ star / ★ mushroom / ★ heart-big / ★ umbrella / ★ rocket / ★ tree
- apple-mini りんご (食べ物) — 10x10 サイズ (15x15 apple と差別化)
- car くるま (乗り物)
- flower はな (自然) — チューリップ
- cup カップ (生活) — マグカップ
- moon つき (自然) — 三日月
- bird とり (動物) — 小鳥
- clock とけい (生活)

### 15x15 (既存 7 + 新規候補 6 → 計 13 候補、最低 10 採用目標)

本格絵柄。動物中心既存に他テーマを追加。

- ★ apple / ★ rabbit / ★ fish / ★ giraffe / ★ elephant / ★ crab / ★ snail
- train でんしゃ (乗り物) — 蒸気機関車
- cake ケーキ (食べ物)
- penguin ペンギン (動物)
- boat ふね (乗り物) — ヨット
- panda パンダ (動物) — 顔
- guitar ギター (生活) — アコギ

### 25x25 (既存 3 + 新規候補 8 → 計 11 候補、最低 10 採用目標)

大物・腰据え。ファンタジー・風景・複雑な動物。

- ★ butterfly / ★ castle / ★ dragon
- lighthouse とうだい (風景)
- whale くじら (動物)
- phoenix ほうおう (ファンタジー)
- mountain やま (自然) — 富士山風
- lion ライオン (動物)
- train-big きしゃ (乗り物) — 大型蒸気機関車
- unicorn ユニコーン (ファンタジー)
- tree-big たいじゅ (自然)

### テーマ分布 (新規候補 30 件)

| テーマ | 5x5 | 10x10 | 15x15 | 25x25 | 計 |
|---|---|---|---|---|---|
| 記号 | 5 | 0 | 0 | 0 | 5 |
| 食べ物 | 0 | 1 | 1 | 0 | 2 |
| 自然 | 1 | 1 | 0 | 2 | 4 |
| 動物 | 0 | 1 | 2 | 3 | 6 |
| 生活 | 3 | 2 | 1 | 0 | 6 |
| 乗り物 | 0 | 1 | 2 | 1 | 4 |
| ファンタジー | 0 | 0 | 0 | 2 | 2 |
| 合計 | 9 | 7 | 6 | 8 | 30 |

## 実装フロー (案 3 ハイブリッド)

サイズごとにループ (5x5 → 10x10 → 15x15 → 25x25)、QA pass 10 件以上揃ったら次サイズへ。

### 各サイズで実行

1. `tools/puzzle-specs/<size>/<id>.grid` 作成 (候補数分)
   - ASCII art (`#` 塗り / `.` 空) で書く
   - 5x5 のみ: 既存 3 件 (heart/diamond/cross) も `.grid` 化
2. `scripts/puzzle-meta.mjs` 更新
   - `META[<id>]` に新規 id 追加 (title/difficulty/description)
   - 5x5 のみ: 既存 3 件も META 登録
   - `ID_ORDER[<size>]` を更新 (既存→新規の順)
   - 5x5 のみ: `SIZES` に '5x5' 追加 / `durationFor('5x5')=60`
3. `bun scripts/build-puzzles.mjs <size>` 実行
   - exit 0 なら全件 pass、exit !=0 なら fail した id を `.grid` 微調整して再実行 (失敗は反復で解決)
4. `bun scripts/validate-puzzle.mjs public/puzzles/<size>/` で個別 QA 確認
5. 10 件以上 pass を確認 → 次サイズへ

### 全サイズ完了後

6. `bun scripts/build-index.mjs` で `public/puzzles/index.json` 再生成
7. `bun scripts/validate-puzzle.mjs` (全件) で最終確認 — exit 0 必須
8. `bun run typecheck` / `bun run test` / `bun run build`

## リスクと対策

| リスク | 対策 |
|---|---|
| QA fail で再試行ループ化 | 候補を多めに確保 (5x5:12 / 10x10:15 / 15x15:13 / 25x25:11)。失敗は調整・再実行で解決 |
| 25x25 の制作コストが高い | 既知パターン (左右対称シルエット + 太線輪郭) を踏襲 (`butterfly`/`castle` 参照) |
| 5x5 既存 JSON の estimatedSolveSeconds が再生成で変わる | `image-to-puzzle.mjs` が `w*h*6` 固定のため 5x5 全件 150 秒に統一 (許容) |
| `src/game/store.test.ts` の HEART fixture が壊れる | HEART は再生成しても solution/clues 不変 (5x5 ハートのビット配列は同一) |
| `image-to-puzzle.mjs` の自動 flip が絵柄を崩す | flip マスを最小化する設定なので大崩れしない。fail 時は手書きを微調整 |

## コミット粒度

- サイズごとに 1 コミット (5x5 統合・10x10 拡張・15x15 拡張・25x25 拡張) → 4 コミット
- 最後に index 更新 + 検証 1 コミット → 計 5 コミット
- 全部 1 PR にまとめる

## 完了時のエビデンス提示

- `validate-puzzle.mjs` の最終 pass 件数 (例: `pass: 40 / fail: 0`)
- 各サイズの最終件数 (5x5: N / 10x10: M / 15x15: K / 25x25: L)
- 採用見送りした候補 id (もしあれば理由付き)

---

## 完了結果 (2026-05-06)

### 採用件数 (各サイズ全候補が QA pass)

| サイズ | 件数 | 内訳 |
|---|---|---|
| 5x5 | 12 | 既存 3 + 新規 9 (うち circle → triangle-up にスワップ、letter-x / smile は同 id で再設計) |
| 10x10 | 15 | 既存 8 + 新規 7 (clock は同 id で再設計、original は pixelRatio=0.73 fail) |
| 15x15 | 13 | 既存 7 + 新規 6 (panda は同 id で再設計、original は pixelRatio=0.78 fail) |
| 25x25 | 11 | 既存 3 + 新規 8 (phoenix / lion は同 id で再設計) |
| **合計** | **51** | 全件 `validate-puzzle.mjs` pass / 全件 `flips=0` (auto-flip 不要) |

### スワップ・再設計の理由

- **circle → triangle-up (5x5)**: ring 形状は対称性が高すぎて多解を持つ。3 回の調整 (ノッチ追加 / 中央点 / リング破断 + 追加セル) でも一意解にならず、階段状の上向き三角形に置換
- **letter-x (5x5)**: 単セル対角線版が 5 components で fail。double-cell コーナー版に再設計 (`##.##/.###./..#../.###./##.##`)
- **smile (5x5)**: bottom mouth `#...#/.###.` が ≥4 components で fail。`#####/.###.` に変更 (口幅広め)
- **clock (10x10)**: 元設計が pixelRatio=0.73。auto-flip では非対称コーナーセルが付加されてしまうため、内部に時計の針 (短針・長針) を表す非対称パターンで再設計
- **panda (15x15)**: 元設計が pixelRatio=0.78 (塗りすぎ)。頭・頬・体のホワイトスペースを増やして 0.70 に
- **phoenix (25x25)**: 元設計が logicallySolvable=false (推測必要)。翼+頭+尾+脚構成で再設計 (脚の縦線が制約を増やし論理可解になる)
- **lion (25x25)**: 元設計が pixelRatio=0.77。たてがみを薄く、内部のホワイトスペース増で 0.68 に

### 検証結果

```
$ bun scripts/validate-puzzle.mjs
... (51 puzzles)
pass: 51 / fail: 0 / total: 51
```

```
$ bun run typecheck     # exit 0
$ bun test              # 119 pass / 0 fail / 13 files
$ bun run build         # vite build + SSG
✓ Generated 57 static HTML pages (Top + 5 hubs + 51 individual)
✓ dist/sitemap.xml (57 URLs)
```

`vite preview` での新パズル URL アクセス確認 (HTTP 200):
- `/puzzles/5x5/triangle-up/` / `/puzzles/10x10/clock/` / `/puzzles/15x15/panda/` / `/puzzles/25x25/phoenix/` / `/puzzles/25x25/unicorn/`
