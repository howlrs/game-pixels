# パズル拡張 R2 (51 → 約 74 件) 設計 — 2026-05-06

## 目的

R1 で 51 件まで拡張済み (PR #66, merged)。R2 では **25x25 を厚くする** 方針 (Q1: C 案) で、薄テーマ (食べ物・乗り物・自然) も他サイズで補完する (Q2: D 案)。

## 完了条件

1. **各サイズの最低追加数達成** (5x5 +3 / 10x10 +3 / 15x15 +4 / 25x25 +5 = 計 +15 件以上)
2. **既存 51 件と新規候補すべて重複なし**
3. **`bun scripts/validate-puzzle.mjs` exit 0** (全採用パズルが QA pass)
4. **`bun run typecheck` exit 0**
5. **`bun run test` exit 0**
6. **`bun run build` exit 0** (SSG / sitemap / OG 自動生成)
7. **`bun run deploy` 成功** (Cloudflare Pages にデプロイ)

## 題材リスト (R1 と重複なし)

候補 23 件 (5+5+6+7) を用意し、QA pass したものを全採用。

### 5x5 (現 12 → +3 目標、候補 5 件)

薄テーマ補完: 自然・天気系。

- `sun` たいよう (自然) — 中央円 + スパイク
- `cloud` くも (自然) — 横長雲
- `umbrella-mini` かさ (生活) — 5x5 (10x10 umbrella と差別化)
- `fish-mini` さかな (動物) — 5x5 (15x15 fish と差別化)
- `leaf` はっぱ (自然)

### 10x10 (現 15 → +3 目標、候補 5 件)

薄テーマ補完: 食べ物・乗り物。

- `bread` パン (食べ物) — 食パン
- `bus` バス (乗り物)
- `pencil` えんぴつ (生活) — 横向き
- `fish-10` さかな (動物) — 10x10 (15x15 fish と差別化)
- `donut` ドーナツ (食べ物)

### 15x15 (現 13 → +4 目標、候補 6 件)

中量本格絵柄: 乗り物・食べ物・動物。

- `airplane` ひこうき (乗り物) — 横向き
- `octopus` たこ (動物) — 8 本足
- `crown` おうかん (生活) — 王冠
- `flamingo` フラミンゴ (動物)
- `pizza` ピザ (食べ物) — ホールピザ
- `teddy` くま (動物) — テディベア顔

### 25x25 (現 11 → +5 目標、候補 7 件)

**大物・風景・ファンタジーで振り切る** (D 案):

- `tiger` トラ (動物) — 顔正面
- `temple` じいん (建物・風景) — 五重塔シルエット
- `shark` サメ (動物) — 横向き
- `samurai` さむらい (人物) — 兜のシルエット
- `spaceship` うちゅうせん (乗り物・SF)
- `turtle` カメ (動物) — 甲羅
- `dolphin-big` イルカ (動物) — ジャンプポーズ

## アーキテクチャ

R1 と同じパイプライン:

```
tools/puzzle-specs/<size>/<id>.grid (ASCII art: # 塗り / . 空)
        ↓ scripts/build-puzzles.mjs [<size>]
        ↓ scripts/image-to-puzzle.mjs (一意解 QA + 最少 flip 探索)
public/puzzles/<size>/<id>.json
        ↓ scripts/build-index.mjs
public/puzzles/index.json
        ↓ scripts/validate-puzzle.mjs (最終 QA)
```

## 実装フロー

サイズごとにループ (5x5 → 10x10 → 15x15 → 25x25):

1. `tools/puzzle-specs/<size>/<id>.grid` を候補数分作成
2. `scripts/puzzle-meta.mjs` 更新 (META + ID_ORDER 末尾追加)
3. `bun scripts/build-puzzles.mjs <size>` 実行
4. fail があれば 1-2 マス調整 → 再実行 (3 回失敗で題材スワップ)
5. `validate-puzzle.mjs <size>/` で確認

全サイズ完了後:

6. `bun scripts/build-index.mjs`
7. `bun scripts/validate-puzzle.mjs` 全件 pass 確認
8. `bun run typecheck` / `bun run test` / `bun run build`
9. PR 作成 → merge → `bun run deploy`

## コミット粒度

- サイズごと 1 commit (5x5 +N / 10x10 +N / 15x15 +N / 25x25 +N) → 4 commits
- 必要なら index 再生成 commit 1 件追加 → 計 4-5 commits
- 1 PR にまとめる

## QA 基準 (R1 と同じ `src/qa/index.ts`)

- requireUnique: true
- requireLogicallySolvable: true
- minPixelRatio: 0.15 / maxPixelRatio: 0.7
- maxComponents: 4
