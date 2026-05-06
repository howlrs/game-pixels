# パズル拡張 (各サイズ 10 件以上化) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5x5/10x10/15x15/25x25 を各 10 件以上に拡張し、5x5 もパイプライン (.grid → build-puzzles) に統合する。テーマ別バランスで重複なく追加し、全採用パズルが `validate-puzzle.mjs` pass を満たす。

**Architecture:** 既存の `tools/puzzle-specs/<size>/<id>.grid → scripts/build-puzzles.mjs → public/puzzles/<size>/<id>.json → scripts/build-index.mjs → index.json → scripts/validate-puzzle.mjs` パイプラインを維持。5x5 を新規対象に追加し、`scripts/puzzle-meta.mjs` の `SIZES` / `META` / `ID_ORDER` を更新。サイズ単位 (5x5 → 10x10 → 15x15 → 25x25) で .grid 作成 → build → validate のループ。QA fail は `.grid` を 1-2 マス調整して再実行する反復解決。

**Tech Stack:** Bun 1.2 / TypeScript / `image-to-puzzle.mjs` (sharp + 自動 flip QA) / `src/qa/index.ts` (一意解 / 論理可解 / pixelRatio 0.15-0.7 / components ≤ 4)

**Spec:** `docs/superpowers/specs/2026-05-06-puzzle-expansion-design.md`

---

## File Structure

### 編集対象
- **`scripts/puzzle-meta.mjs`** — `SIZES` に '5x5' 追加 / `META` に新規 id 全件登録 (5x5 既存 3 + 新規候補 + 10x10/15x15/25x25 新規候補) / `ID_ORDER[<size>]` に新規 id 追加 / `durationFor('5x5')=60` 追加

### 新規作成 (.grid)
- **`tools/puzzle-specs/5x5/`** — heart.grid, diamond.grid, cross.grid (既存 JSON から逆生成) + 新規候補 9 件 = 12 件
- **`tools/puzzle-specs/10x10/`** — 新規候補 7 件
- **`tools/puzzle-specs/15x15/`** — 新規候補 6 件
- **`tools/puzzle-specs/25x25/`** — 新規候補 8 件

### 自動生成 (コミット対象)
- **`public/puzzles/5x5/<id>.json`** — `build-puzzles.mjs 5x5` で生成
- **`public/puzzles/10x10/<id>.json`** — `build-puzzles.mjs 10x10` で生成 (新規分)
- **`public/puzzles/15x15/<id>.json`** — `build-puzzles.mjs 15x15` で生成 (新規分)
- **`public/puzzles/25x25/<id>.json`** — `build-puzzles.mjs 25x25` で生成 (新規分)
- **`public/puzzles/index.json`** — `build-index.mjs` で再生成

### 触らない
- `src/`, `scripts/image-to-puzzle.mjs`, `scripts/validate-puzzle.mjs`, `scripts/build-puzzles.mjs`, `scripts/build-index.mjs` は変更不要。

---

## Task 1: 5x5 既存パズルを .grid 化 + パイプライン統合準備

**Files:**
- Create: `tools/puzzle-specs/5x5/heart.grid`
- Create: `tools/puzzle-specs/5x5/diamond.grid`
- Create: `tools/puzzle-specs/5x5/cross.grid`
- Modify: `scripts/puzzle-meta.mjs` (SIZES / META / ID_ORDER / durationFor に 5x5 追加)

- [ ] **Step 1: heart.grid を作成 (既存 public/puzzles/5x5/heart.json の solution から逆生成)**

```
// 5x5 ハート
.#.#.
#####
#####
.###.
..#..
```

ファイル: `tools/puzzle-specs/5x5/heart.grid`

- [ ] **Step 2: diamond.grid を作成**

```
// 5x5 ダイヤ
..#..
.###.
#####
.###.
..#..
```

ファイル: `tools/puzzle-specs/5x5/diamond.grid`

- [ ] **Step 3: cross.grid を作成**

```
// 5x5 プラス
..#..
..#..
#####
..#..
..#..
```

ファイル: `tools/puzzle-specs/5x5/cross.grid`

- [ ] **Step 4: scripts/puzzle-meta.mjs を編集して 5x5 を SIZES に追加**

`SIZES = ['10x10', '15x15', '25x25']` を `SIZES = ['5x5', '10x10', '15x15', '25x25']` に変更。

- [ ] **Step 5: META に 5x5 既存 3 件を追加**

`META` オブジェクトの先頭 (10x10 の前) に追加:

```javascript
  // 5x5
  heart: { title: 'ハート', difficulty: 'easy', description: 'シンプルなハートマーク' },
  diamond: { title: 'ダイヤ', difficulty: 'easy', description: 'ひし形 (ダイヤモンド)' },
  cross: { title: 'プラス', difficulty: 'easy', description: 'プラス記号 (十字)' },
```

`// 5x5 (既存、build-puzzles では使わないが index 用に残す)` のコメントブロックは削除する。

- [ ] **Step 6: durationFor に 5x5 を追加**

`scripts/puzzle-meta.mjs` の `durationFor` 関数:

```javascript
export function durationFor(size) {
  if (size === '5x5') return 60;
  if (size === '10x10') return 600;
  if (size === '15x15') return 1200;
  if (size === '25x25') return 2400;
  return 60;
}
```

- [ ] **Step 7: 5x5 既存 3 件を build-puzzles で再生成**

Run: `bun scripts/build-puzzles.mjs 5x5`
Expected: `pass: 3 / fail: 0` で exit 0

- [ ] **Step 8: 既存テストが通ることを確認**

Run: `bun run test src/game/store.test.ts`
Expected: 全 pass (HEART fixture は再生成しても solution/clues 同一)

Run: `bun run typecheck`
Expected: エラー無し

- [ ] **Step 9: コミット**

```bash
git add tools/puzzle-specs/5x5/ scripts/puzzle-meta.mjs public/puzzles/5x5/
git commit -m "$(cat <<'EOF'
chore(puzzles): 5x5 をパイプラインに統合 (.grid + META 登録)

既存 heart/diamond/cross を .grid 化し SIZES/META/durationFor に 5x5 を追加。
build-puzzles.mjs 5x5 で再生成し既存 3 件は引き続き QA pass。
diamond の estimatedSolveSeconds 90→60 (durationFor 統一)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 5x5 新規候補 9 件を作成して build/validate

**Files:**
- Create: `tools/puzzle-specs/5x5/{arrow-up,smile,star-mini,circle,key,bolt,letter-x,square,note}.grid` (9 files)
- Modify: `scripts/puzzle-meta.mjs` (META + ID_ORDER に新規 9 件追加)

- [ ] **Step 1: arrow-up.grid を作成**

```
// 5x5 やじるし (上向き)
..#..
.###.
#####
..#..
..#..
```

- [ ] **Step 2: smile.grid を作成**

```
// 5x5 スマイル
.#.#.
.#.#.
.....
#...#
.###.
```

- [ ] **Step 3: star-mini.grid を作成**

```
// 5x5 ほし
..#..
#####
.###.
.#.#.
#...#
```

- [ ] **Step 4: circle.grid を作成**

```
// 5x5 まる
.###.
#...#
#...#
#...#
.###.
```

- [ ] **Step 5: key.grid を作成**

```
// 5x5 かぎ
.###.
.#.#.
.###.
..#..
.###.
```

- [ ] **Step 6: bolt.grid を作成**

```
// 5x5 いなずま
.###.
.##..
####.
..##.
.##..
```

- [ ] **Step 7: letter-x.grid を作成**

```
// 5x5 ばつ
#...#
.#.#.
..#..
.#.#.
#...#
```

- [ ] **Step 8: square.grid を作成**

```
// 5x5 しかく (フレーム)
#####
#...#
#...#
#...#
#####
```

- [ ] **Step 9: note.grid を作成**

```
// 5x5 おんぷ
...##
...##
.####
####.
####.
```

- [ ] **Step 10: scripts/puzzle-meta.mjs に新規 9 件を META 登録**

5x5 ブロックに追加:

```javascript
  'arrow-up': { title: 'やじるし', difficulty: 'easy', description: '上向きの矢印' },
  smile: { title: 'スマイル', difficulty: 'easy', description: 'にっこり顔' },
  'star-mini': { title: 'ほし', difficulty: 'easy', description: '小さな星' },
  circle: { title: 'まる', difficulty: 'easy', description: '丸い枠' },
  key: { title: 'かぎ', difficulty: 'easy', description: '鍵' },
  bolt: { title: 'いなずま', difficulty: 'easy', description: 'いなずまマーク' },
  'letter-x': { title: 'ばつ', difficulty: 'easy', description: 'X 印' },
  square: { title: 'しかく', difficulty: 'easy', description: '四角フレーム' },
  note: { title: 'おんぷ', difficulty: 'easy', description: '音符' },
```

- [ ] **Step 11: ID_ORDER[5x5] を更新**

```javascript
  '5x5': ['heart', 'diamond', 'cross', 'arrow-up', 'smile', 'star-mini', 'circle', 'key', 'bolt', 'letter-x', 'square', 'note'],
```

- [ ] **Step 12: build-puzzles で全 5x5 を生成**

Run: `bun scripts/build-puzzles.mjs 5x5`
Expected: 12 件の生成試行。fail があれば該当 id をリストアップ。

- [ ] **Step 13: fail した 5x5 を反復修正**

各 fail id について:
1. エラーメッセージ (一意解にならない / pixelRatio 範囲外 / components > 4) を確認
2. `.grid` を 1-2 マス調整 (例: 対称性追加、塗り増減、孤立点削除)
3. `bun scripts/image-to-puzzle.mjs tools/puzzle-specs/5x5/<id>.grid --id <id> --title '<title>' --width 5 --height 5 --category 5x5 --difficulty easy --description '<desc>' --out public/puzzles/5x5/<id>.json` で個別再試行
4. pass まで繰り返す

最後に `bun scripts/build-puzzles.mjs 5x5` で全件 pass を確認。
Expected: `pass: 12 / fail: 0`

- [ ] **Step 14: validate-puzzle で 5x5 を全件確認**

Run: `bun scripts/validate-puzzle.mjs public/puzzles/5x5/`
Expected: `pass: 12 / fail: 0 / total: 12` で exit 0。10 件未満なら追加候補を作成 (例: `triangle`, `cup-mini` 等) して 10 件以上にする。

- [ ] **Step 15: コミット**

```bash
git add tools/puzzle-specs/5x5/ scripts/puzzle-meta.mjs public/puzzles/5x5/
git commit -m "$(cat <<'EOF'
feat(puzzles): 5x5 を 12 件に拡張 (新規 9 件追加)

arrow-up/smile/star-mini/circle/key/bolt/letter-x/square/note を追加。
全件 validate-puzzle.mjs pass を確認。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 10x10 新規候補 7 件を作成して build/validate

**Files:**
- Create: `tools/puzzle-specs/10x10/{apple-mini,car,flower,cup,moon,bird,clock}.grid` (7 files)
- Modify: `scripts/puzzle-meta.mjs` (META + ID_ORDER に新規 7 件追加)

- [ ] **Step 1: apple-mini.grid を作成**

```
// 10x10 りんご (10x10 サイズ)
....##....
....#.....
..######..
.########.
##########
##########
##########
.########.
.########.
..######..
```

- [ ] **Step 2: car.grid を作成**

```
// 10x10 くるま (横向き)
..........
..........
....####..
.########.
##########
##########
##########
##########
.##....##.
.##....##.
```

- [ ] **Step 3: flower.grid を作成**

```
// 10x10 はな (チューリップ)
..........
...####...
..######..
..######..
...####...
.....#....
.....#....
....###...
...#####..
..#######.
```

- [ ] **Step 4: cup.grid を作成**

```
// 10x10 カップ (マグカップ)
..........
.########.
.#......#.
.#......##
.#......##
.#......#.
.#......#.
.########.
..######..
..........
```

- [ ] **Step 5: moon.grid を作成**

```
// 10x10 つき (三日月)
...####...
..######..
.####.....
.####.....
####......
####......
.####.....
.####.....
..######..
...####...
```

- [ ] **Step 6: bird.grid を作成**

```
// 10x10 とり (小鳥)
..........
....####..
...#####..
...######.
.########.
##########
.########.
.######...
..####....
....##....
```

- [ ] **Step 7: clock.grid を作成**

```
// 10x10 とけい
..######..
.########.
##.####.##
##.####.##
##.####.##
##.####.##
##......##
.########.
.########.
..######..
```

- [ ] **Step 8: scripts/puzzle-meta.mjs に新規 7 件を META 登録**

10x10 ブロックの末尾に追加:

```javascript
  'apple-mini': { title: 'りんご (小)', difficulty: 'medium', description: '小さなりんご' },
  car: { title: 'くるま', difficulty: 'medium', description: '横向きの車' },
  flower: { title: 'はな', difficulty: 'medium', description: 'チューリップ' },
  cup: { title: 'カップ', difficulty: 'medium', description: 'マグカップ' },
  moon: { title: 'つき', difficulty: 'medium', description: '三日月' },
  bird: { title: 'とり', difficulty: 'medium', description: '小鳥' },
  clock: { title: 'とけい', difficulty: 'medium', description: '時計' },
```

- [ ] **Step 9: ID_ORDER[10x10] を更新**

```javascript
  '10x10': ['cat', 'house', 'star', 'mushroom', 'heart-big', 'umbrella', 'rocket', 'tree', 'apple-mini', 'car', 'flower', 'cup', 'moon', 'bird', 'clock'],
```

- [ ] **Step 10: build-puzzles で 10x10 全件を生成**

Run: `bun scripts/build-puzzles.mjs 10x10`
Expected: 15 件 (既存 8 + 新規 7) 全件 pass。fail があれば反復修正。

- [ ] **Step 11: fail した 10x10 を反復修正**

Task 2 Step 13 と同じ手順で `.grid` 調整 → 個別 image-to-puzzle 再試行 → pass まで反復。

- [ ] **Step 12: validate-puzzle で 10x10 を全件確認**

Run: `bun scripts/validate-puzzle.mjs public/puzzles/10x10/`
Expected: `pass: 15 / fail: 0 / total: 15`。10 件未満なら追加候補作成。

- [ ] **Step 13: コミット**

```bash
git add tools/puzzle-specs/10x10/ scripts/puzzle-meta.mjs public/puzzles/10x10/
git commit -m "$(cat <<'EOF'
feat(puzzles): 10x10 を 15 件に拡張 (新規 7 件追加)

apple-mini/car/flower/cup/moon/bird/clock を追加。全件 QA pass。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 15x15 新規候補 6 件を作成して build/validate

**Files:**
- Create: `tools/puzzle-specs/15x15/{train,cake,penguin,boat,panda,guitar}.grid` (6 files)
- Modify: `scripts/puzzle-meta.mjs` (META + ID_ORDER に新規 6 件追加)

- [ ] **Step 1: train.grid を作成 (蒸気機関車・横向き)**

```
// 15x15 でんしゃ (蒸気機関車)
......#........
......#........
.....###.......
.....###.......
.############..
.############..
.############..
##############.
##############.
##############.
##############.
.############..
..##......##...
..##......##...
..##......##...
```

- [ ] **Step 2: cake.grid を作成**

```
// 15x15 ケーキ
.......#.......
......###......
.....#####.....
.....#####.....
....#######....
.#############.
.#############.
.#############.
.#############.
.#############.
.#############.
.#############.
.#############.
.#############.
###############
```

- [ ] **Step 3: penguin.grid を作成**

```
// 15x15 ペンギン
.....#####.....
....#######....
....##...##....
....#.....#....
....#.....#....
....#######....
....#######....
...#########...
..###########..
..###########..
..###########..
..###########..
..##.....##....
..##.....##....
.####...####...
```

- [ ] **Step 4: boat.grid を作成**

```
// 15x15 ふね (ヨット)
.......#.......
.......##......
.......###.....
.......####....
.......#####...
.......######..
.......#######.
.......########
.......#.......
.......#.......
###############
.#############.
..###########..
...#########...
.....#####.....
```

- [ ] **Step 5: panda.grid を作成**

```
// 15x15 パンダ (顔)
...#########...
..###########..
.#############.
##.#########.##
#####.....#####
#####.....#####
###############
######...######
#####.###.#####
#####.....#####
#####.###.#####
.#############.
.#############.
..###########..
...#########...
```

- [ ] **Step 6: guitar.grid を作成 (アコースティック)**

```
// 15x15 ギター
.......#.......
.......#.......
......###......
......###......
......###......
......###......
......###......
......###......
.....#####.....
....#######....
...#########...
..###########..
..###########..
...#########...
....#######....
```

- [ ] **Step 7: scripts/puzzle-meta.mjs に新規 6 件を META 登録**

15x15 ブロックの末尾に追加:

```javascript
  train: { title: 'でんしゃ', difficulty: 'hard', description: '蒸気機関車' },
  cake: { title: 'ケーキ', difficulty: 'hard', description: 'ホールケーキ' },
  penguin: { title: 'ペンギン', difficulty: 'hard', description: 'ペンギン' },
  boat: { title: 'ふね', difficulty: 'hard', description: 'ヨット' },
  panda: { title: 'パンダ', difficulty: 'hard', description: 'パンダの顔' },
  guitar: { title: 'ギター', difficulty: 'hard', description: 'アコースティックギター' },
```

- [ ] **Step 8: ID_ORDER[15x15] を更新**

```javascript
  '15x15': ['apple', 'rabbit', 'fish', 'giraffe', 'elephant', 'crab', 'snail', 'train', 'cake', 'penguin', 'boat', 'panda', 'guitar'],
```

- [ ] **Step 9: build-puzzles で 15x15 全件を生成**

Run: `bun scripts/build-puzzles.mjs 15x15`
Expected: 13 件 (既存 7 + 新規 6) 全件 pass。fail があれば反復修正。

- [ ] **Step 10: fail した 15x15 を反復修正**

Task 2 Step 13 と同じ手順で反復。

- [ ] **Step 11: validate-puzzle で 15x15 を全件確認**

Run: `bun scripts/validate-puzzle.mjs public/puzzles/15x15/`
Expected: `pass: 13 / fail: 0 / total: 13`。10 件未満なら追加候補作成。

- [ ] **Step 12: コミット**

```bash
git add tools/puzzle-specs/15x15/ scripts/puzzle-meta.mjs public/puzzles/15x15/
git commit -m "$(cat <<'EOF'
feat(puzzles): 15x15 を 13 件に拡張 (新規 6 件追加)

train/cake/penguin/boat/panda/guitar を追加。全件 QA pass。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 25x25 新規候補 8 件を作成して build/validate

**Files:**
- Create: `tools/puzzle-specs/25x25/{lighthouse,whale,phoenix,mountain,lion,train-big,unicorn,tree-big}.grid` (8 files)
- Modify: `scripts/puzzle-meta.mjs` (META + ID_ORDER に新規 8 件追加)

> **Note**: 25x25 は手書きコストが高いため、各 .grid は左右対称・太線輪郭・最小内部空白を意識した設計とする。fail 時は対称性を保ちつつマス調整。

- [ ] **Step 1: lighthouse.grid を作成 (灯台、左右対称)**

```
// 25x25 とうだい (灯台)
............#............
...........###...........
..........#####..........
..........#####..........
..........#####..........
..........#####..........
.........#######.........
.........#######.........
.........#######.........
.........#######.........
.........#######.........
.........#######.........
........#########........
........#########........
.......###########.......
.......###########.......
......#############......
......#############......
.....###############.....
.....###############.....
....#################....
....#################....
....#################....
....#################....
.........................
```

- [ ] **Step 2: whale.grid を作成 (クジラ、横向き)**

```
// 25x25 くじら
.........................
.........................
.........................
......#####..............
....#########............
...###########...........
..#############..........
.###############.........
##################.......
####################.....
######################...
#######################..
########################.
#########################
#########################
########################.
#######################..
######################...
####################.....
##################.......
.###############.........
..#############..........
...###########...........
....#########............
......#####..............
```

- [ ] **Step 3: phoenix.grid を作成 (不死鳥、左右対称)**

```
// 25x25 ほうおう
............#............
...........###...........
..........#####..........
..........#####..........
.........#######.........
.........#######.........
........#########........
.......#####.#####.......
......####...####........
.....####.....####.......
....####.......####......
...####.........####.....
..####...........####....
.####.............####...
####...............####..
####.....#####.....####..
.####...#######...####...
..####.#########.####....
...##############........
....############.........
.....##########..........
......########...........
.......######............
........####.............
.........##..............
```

- [ ] **Step 4: mountain.grid を作成 (富士山風、左右対称)**

```
// 25x25 やま
.........................
.........................
.........................
.........................
.........................
............#............
...........###...........
..........#####..........
.........###.###.........
.........##...##.........
........###...###........
........#########........
.......###########.......
......#############......
......#############......
.....###############.....
....#################....
...###################...
...###################...
..#####################..
..#####################..
.#######################.
.#######################.
#########################
#########################
```

- [ ] **Step 5: lion.grid を作成 (顔、たてがみ、左右対称)**

```
// 25x25 ライオン
.....#...........#.......
....###.........###......
...#####.......#####.....
..#######.....#######....
.##############.#######..
##################.#####.
##################.######
##################.######
####...########...#######
####.#.########.#.#######
####...########...#######
##########.##.###########
##########.##.###########
###############.#########
###...........###########
####.#######.############
####.#######.############
####.#######.############
####.........############
###############.#########
##############.##########
.#############.##########
..############.##########
...#############.########
.....##########..########
```

- [ ] **Step 6: train-big.grid を作成 (大型蒸気機関車)**

```
// 25x25 きしゃ (大型)
.........................
.........................
........#................
........#................
.......###...............
.......###...............
......#####..............
......#####..............
.#######################.
.#######################.
.#######################.
.#######################.
.#######################.
##########################
##########################
##########################
##########################
##########################
##########################
.#######################.
..####......####....####.
..####......####....####.
..####......####....####.
..####......####....####.
.........................
```

- [ ] **Step 7: unicorn.grid を作成 (ユニコーン)**

```
// 25x25 ユニコーン
............#............
...........###...........
..........#####..........
..........#####..........
.........#######.........
.........#######.........
........#########........
........#########........
.......###########.......
.......###########.......
......#############......
.....###############.....
....#################....
....#################....
.....###############.....
.....###############.....
.......##.......##.......
.......##.......##.......
.......##.......##.......
.......##.......##.......
.......##.......##.......
.......##.......##.......
.......##.......##.......
.......##.......##.......
.......##.......##.......
```

- [ ] **Step 8: tree-big.grid を作成 (大樹、左右対称)**

```
// 25x25 たいじゅ
.........................
............#............
...........###...........
..........#####..........
.........#######.........
........#########........
.......###########.......
......#############......
.....###############.....
....#################....
...###################...
..#####################..
..#####################..
..#####################..
.#######################.
.#######################.
.#######################.
##########.....##########
###########.#.###########
###########.#.###########
###########.#.###########
###########.#.###########
##########.....##########
.........................
.........................
```

- [ ] **Step 9: scripts/puzzle-meta.mjs に新規 8 件を META 登録**

25x25 ブロックの末尾に追加:

```javascript
  lighthouse: { title: 'とうだい', difficulty: 'hard', description: '灯台' },
  whale: { title: 'くじら', difficulty: 'hard', description: 'クジラ' },
  phoenix: { title: 'ほうおう', difficulty: 'hard', description: '不死鳥' },
  mountain: { title: 'やま', difficulty: 'hard', description: '富士山風の山' },
  lion: { title: 'ライオン', difficulty: 'hard', description: 'たてがみのライオン' },
  'train-big': { title: 'きしゃ', difficulty: 'hard', description: '大型蒸気機関車' },
  unicorn: { title: 'ユニコーン', difficulty: 'hard', description: 'ユニコーン' },
  'tree-big': { title: 'たいじゅ', difficulty: 'hard', description: '大樹' },
```

- [ ] **Step 10: ID_ORDER[25x25] を更新**

```javascript
  '25x25': ['butterfly', 'castle', 'dragon', 'lighthouse', 'whale', 'phoenix', 'mountain', 'lion', 'train-big', 'unicorn', 'tree-big'],
```

- [ ] **Step 11: build-puzzles で 25x25 全件を生成**

Run: `bun scripts/build-puzzles.mjs 25x25`
Expected: 11 件 (既存 3 + 新規 8) 全件 pass。fail があれば反復修正。

- [ ] **Step 12: fail した 25x25 を反復修正**

Task 2 Step 13 と同じ手順で反復。25x25 は左右対称を維持しながら 1-2 マス調整 (例: 内部の小さな穴を埋める / 翼端を 1 マス太くする)。

- [ ] **Step 13: validate-puzzle で 25x25 を全件確認**

Run: `bun scripts/validate-puzzle.mjs public/puzzles/25x25/`
Expected: `pass: 11 / fail: 0 / total: 11`。10 件未満なら追加候補作成。

- [ ] **Step 14: コミット**

```bash
git add tools/puzzle-specs/25x25/ scripts/puzzle-meta.mjs public/puzzles/25x25/
git commit -m "$(cat <<'EOF'
feat(puzzles): 25x25 を 11 件に拡張 (新規 8 件追加)

lighthouse/whale/phoenix/mountain/lion/train-big/unicorn/tree-big を追加。全件 QA pass。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: index 再生成・全件検証・本番ビルド

**Files:**
- Modify: `public/puzzles/index.json` (build-index.mjs で再生成)

- [ ] **Step 1: index を再生成**

Run: `bun scripts/build-index.mjs`
Expected: `✓ public/puzzles/index.json (51 puzzles)` 程度 (=12+15+13+11)。実際の件数は採用結果による (各サイズ 10 件以上)。

- [ ] **Step 2: 全件 validate-puzzle で最終確認**

Run: `bun scripts/validate-puzzle.mjs`
Expected: `pass: <N> / fail: 0 / total: <N>` で exit 0。N は採用件数 (40 以上)。

- [ ] **Step 3: typecheck**

Run: `bun run typecheck`
Expected: エラー無し

- [ ] **Step 4: 全テスト**

Run: `bun run test`
Expected: 既存テスト全 pass。

- [ ] **Step 5: 本番ビルド (SSG 含む)**

Run: `bun run build`
Expected: vite build 成功 + build:ssg (og-images/static-pages/sitemap) 成功。新パズル分の `/puzzles/<cat>/<id>/` 静的ページが dist/ に生成されることを確認。

- [ ] **Step 6: dev server で目視確認**

Run: `bun run dev` (バックグラウンド)

ブラウザで `http://localhost:5173/` を開き:
1. PuzzleSelect 画面で 4 カテゴリそれぞれ 10 件以上が並ぶこと
2. 新パズル数件 (各サイズから 1 件) を実プレイし、clue 表示・タップ反応・完成判定が既存と同じく動くこと
3. 直接 URL アクセス `/puzzles/5x5/arrow-up/` などが 200 で開けること

確認後 dev server を停止。

- [ ] **Step 7: コミット**

```bash
git add public/puzzles/index.json
git commit -m "$(cat <<'EOF'
chore(puzzles): index.json を再生成 (40 件以上)

build-index.mjs で全サイズ 10 件以上に拡張された index を再生成。
validate-puzzle.mjs / typecheck / test / build 全 pass を確認。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: 完了エビデンス報告**

ユーザーに以下を提示:
- `validate-puzzle.mjs` の最終 pass 件数 (例: `pass: 51 / fail: 0`)
- 各サイズの最終件数 (5x5: N / 10x10: M / 15x15: K / 25x25: L)
- 採用見送りした候補 id (もしあれば理由付き)
- `bun run build` の成功確認

---

## Self-Review Notes

- **Spec coverage**: 完了条件 6 項目すべてに対応するタスクあり (Task 1-5 で各サイズ 10 件以上 / Task 6 で validate / typecheck / test / build)。✓
- **Placeholder scan**: 全 step に具体的な `.grid` 内容 / META 追加コード / コマンド明示。"TBD"/"TODO"/"as needed" 無し。✓
- **Type consistency**: META フィールド (title/difficulty/description) は既存と同形式。ID_ORDER 配列構造も既存と同形式。✓
- **既知のリスク**: 各 .grid の絵柄案は QA fail する可能性あり (特に 25x25)。fail 時は Step "反復修正" で `.grid` を 1-2 マス調整して個別 image-to-puzzle で再試行。3 回失敗で題材スワップ (例: phoenix が通らなければ `wolf` などへ差し替え)。
