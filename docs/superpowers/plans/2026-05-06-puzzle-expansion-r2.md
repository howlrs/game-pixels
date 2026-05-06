# パズル拡張 R2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

**Goal:** R1 PR #66 で 51 件まで拡張済み。R2 で 25x25 厚め (D 案) で +15 件以上を追加し約 74 件に。

**Architecture:** R1 と同じパイプライン (.grid → build-puzzles → image-to-puzzle → JSON → index → validate)。`scripts/puzzle-meta.mjs` の META + ID_ORDER 末尾追加。

**Tech Stack:** Bun / TypeScript / `image-to-puzzle.mjs` / `src/qa/index.ts` (一意解 / 論理可解 / pixelRatio 0.15-0.7 / components ≤ 4)

**Spec:** `docs/superpowers/specs/2026-05-06-puzzle-expansion-r2-design.md`

---

## Task 1: 5x5 +5 候補

**New ids:** sun, cloud, umbrella-mini, fish-mini, leaf

- [ ] .grid 5 件作成 (各 5 行 × 5 chars)
- [ ] `scripts/puzzle-meta.mjs`: META に 5 件追加 + ID_ORDER['5x5'] 末尾に append
- [ ] `bun scripts/build-puzzles.mjs 5x5` exit 0 / `validate-puzzle.mjs public/puzzles/5x5/` exit 0
- [ ] fail 時は 1-2 マス調整して反復、3 回ダメなら id スワップ (alternatives: `dot`, `triangle-down`, `square-mini`, `wave`, `mountain-mini`)
- [ ] commit: `feat(puzzles): 5x5 R2 +N 件追加 (...)` 

## Task 2: 10x10 +5 候補

**New ids:** bread, bus, pencil, fish-10, donut

- [ ] .grid 5 件作成 (10 行 × 10 chars)
- [ ] META + ID_ORDER 更新
- [ ] build / validate
- [ ] fail 反復、alternatives: `cake-mini`, `taxi`, `flag`, `book`, `lollipop`
- [ ] commit

## Task 3: 15x15 +6 候補

**New ids:** airplane, octopus, crown, flamingo, pizza, teddy

- [ ] .grid 6 件作成 (15 行 × 15 chars)
- [ ] META + ID_ORDER 更新
- [ ] build / validate
- [ ] fail 反復、alternatives: `swan`, `dolphin`, `mushroom-big`, `rocket-big`, `peacock`, `bee`
- [ ] commit

## Task 4: 25x25 +7 候補

**New ids:** tiger, temple, shark, samurai, spaceship, turtle, dolphin-big

- [ ] .grid 7 件作成 (25 行 × 25 chars 厳守)
- [ ] META + ID_ORDER 更新
- [ ] build / validate
- [ ] fail 反復、alternatives: `wolf`, `dinosaur`, `windmill`, `lighthouse-2`, `eagle`
- [ ] commit

## Task 5: 最終検証

- [ ] `bun scripts/build-index.mjs` (51 → ~74 件に)
- [ ] `bun scripts/validate-puzzle.mjs` 全件 pass
- [ ] `bun run typecheck` / `bun test` / `bun run build`
- [ ] commit (index.json 更新があれば)

## Task 6: PR・マージ・デプロイ

- [ ] `git push -u origin feat/puzzle-expansion-r2`
- [ ] `gh pr create --base main`
- [ ] `gh pr merge --merge --delete-branch`
- [ ] `git pull` on main
- [ ] `bun run deploy` (Cloudflare Pages)

## QA 基準 (R1 と同じ)

- requireUnique: true / requireLogicallySolvable: true
- pixelRatio 0.15-0.7 / components ≤ 4
- 全候補 `flips=0` 達成を目標 (auto-flip による絵柄崩れ回避)
