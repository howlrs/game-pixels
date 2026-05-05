# HANDOFF (2026-05-05)

マリオピクセル (Web 2D サイドスクロール プラットフォーマー) の事前調査セッション引き継ぎ資料。

## 現在の状態

- リポジトリ: https://github.com/howlrs/game-pixels
- ローカル: `/home/o9oem/workspace/mine/temp/mario-pixel`
- ブランチ: `main` (clean) + 本資料用 `chore/handoff-2026-05-05`
- タグ: `v0.1.0-draft` (初稿) / `v0.2.0-docs-round1` (Gemini Pro Round1 レビュー反映済)
- ライセンス: MIT
- 公開アカウント: howlrs (sharebook.amazon@gmail.com)

## 完了済み (このセッション)

1. **docs/ 19 章 初稿執筆** — 物理 / 衝突 / プレイヤー / 敵 / アイテム / カメラ / ワールド / 入力 / 描画 / 音 / セーブ / アーキテクチャ / 性能 / a11y / クロスデバイス / ピクセル現代化 / 未決事項
2. **Gemini Pro Round1 レビュー反映** — Issue #1-3 / PR #4-6 / ファイナライズ PR #7 → main マージ → タグ v0.2.0-docs-round1
3. **12 専門家 + Gemini Pro 討議 8 件 を Issue 化**
   - #8 (T2): 完成カラーリング + 3D 報酬演出
   - #9 (T3): タップ/クリック UX 向上
   - #10 (T5): 技術スタック version:latest 厳格定義
   - #11 (T1): 旧技術アップデート (WebGPU/bitECS/Valibot 等)
   - #12 (T4): 完成保証と不完全コンテンツ防止
   - #13 (T6): 実装規約と画面/シーン設計
   - #14 (T7): テスト戦略と CI パイプライン
   - #15 (T8): 出題(ステージ)品質と座標完成性
4. **SurrealDB 記録** — output_log 1件 / review_log 11件 (Round1 × 3 + パネル × 8) / knowledge 1件

## 次セッションの開始手順

```bash
cd /home/o9oem/workspace/mine/temp/mario-pixel
git checkout main && git pull --ff-only
gh issue list --state open       # 未着手 Issue 一覧
git tag -l                       # タグ確認
```

過去知見の呼び戻し:
```bash
/home/o9oem/workspace/surreal-query.sh --knowledge-search --tags "mario-pixel" --limit 10 --preview-only
/home/o9oem/workspace/surreal-query.sh "SELECT title, output_type, tags, created_at FROM output_log WHERE tags CONTAINSANY ['mario-pixel'] ORDER BY created_at DESC LIMIT 10"
/home/o9oem/workspace/surreal-query.sh "SELECT review_mode, model, target, tags, created_at FROM review_log WHERE tags CONTAINSANY ['mario-pixel'] ORDER BY created_at DESC LIMIT 20"
```

## 次にやるべきこと (優先順)

1. **方針確定の docs 反映 (Round 2)**
   - Issue #11 (T1) → §20/§80/§90/§91/§94/§97/§98 を WebGPU/bitECS/Valibot/Zustand/Vite 6+ ベースに書き換え
   - Issue #10 (T5) → §94 末尾に 14.14 確定スタック表を追加、各章の表記を統一
   - 着手は #11 → #10 の順 (T1 でアーキ決定 → T5 で版番号確定の流れ)
2. **報酬演出と UX の docs 反映**
   - Issue #8 (T2) → 新章 §31_rewards-and-presentation.md
   - Issue #9 (T3) → §90 / §97 への加筆
3. **品質仕組みの docs 反映**
   - Issue #12 (T4) → 新章 §95.5_failsafe-and-validation.md
   - Issue #15 (T8) → 新章 §82_stage-quality.md
4. **実装/テストの docs 反映**
   - Issue #13 (T6) → §94.5/§94.6 加筆 + §91/§92/§80 連動
   - Issue #14 (T7) → 新章 §95.6_test-strategy.md + §20 にハッシュ生成ルール追記
5. **タグ運用**
   - Round 2 完了で `v0.3.0-docs-round2`
   - 実装着手前に `v0.4.0-spec-frozen` (実装ロックポイント)
6. **実装着手**
   - 確定スタック (Bun 1.2.0 / TS 5.8.2 / Vite 6.0.0 / React 19.0.0 / Pixi.js 8.2.1 / bitECS / Howler 2.2.4 / Zustand 5.1.0 / Valibot 0.33.0 / Biome 1.8.0 / Playwright 1.45.0 / vite-plugin-pwa 0.20.0 / i18next 23.11.0)
   - `package.json` は絶対バージョン (^/~ 禁止)、`bun.lockb` を Git 管理
   - Renovate 設定例は Issue #10 本文を参照

## ブランチ運用ルール (確立済)

- 各 Issue ごとに `docs/<topic>` または `feat/<topic>` のトピックブランチ
- PR で main に merge (squash, branch 自動削除)
- main タグは `vX.Y.Z-<phase>` 形式
- Gemini レビュー (`~/.claude/hooks/gemini-review.sh`) を Issue 起票前 / PR 前に必須通過
- `^/~` 禁止、依存追加は `bun add <pkg>@<version>` で絶対指定

## 各 Issue の DoD (要点)

- すべての Issue 本文末尾に「完了条件 (Definition of Done)」を明示済み。実装時はそのチェックリストを順に潰す。

## 未決事項

`docs/99_open-questions.md` の §19.1 を参照:
- 内部解像度デフォルト (256×240 vs 480×270)
- World Map 形式 (SMB1 vs SMB3)
- リスポーン時のサイズ (Small 強制 vs 維持)
- ステージ進行の自動セーブ
- マルチプレイ拡張 / UGC / ECS 移行タイミング / マネタイズ

## 環境メモ

- WSL2 Ubuntu Noble + SurrealDB (agents/agents) 自動起動
- Gemini レビューは `~/.claude/hooks/gemini-review.sh`
  - flash-lite (qa, review): 軽量レビュー
  - pro (deep, --pro): 深掘り討議
  - issue: Issue 起票前レビュー
  - image: Gemini 画像生成 (報酬演出のスタイル検討に使える)
- Playwright (ms-playwright) はクロスデバイス検証で利用予定
