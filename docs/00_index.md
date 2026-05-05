# ピクセルズ — ゲームロジック仕様書 (Round 5: ノノグラム仕様)

本ドキュメント群は、Web (PC/スマホ クロスデバイス) で動作する **汎用ノノグラム (ピクチャーロジック)** の Web アプリ「ピクセルズ」の実装に先立ち、ゲームロジックを体系化したものである。

## ジャンル転換について (Round 5 の経緯)

本リポジトリは Round 1〜4 で「2D サイドスクロール プラットフォーマー (旧コード名: マリオピクセル)」として仕様策定 + 実装スケルトン + MVP α (旧タグ v0.5.0-mvp-alpha) を完成させていたが、Round 5 でユーザー要望によりジャンルを **汎用ノノグラム** に全面転換した。任天堂 IP は使用せず、独立した Web ピクチャーロジックゲームとして実装する。

足回り (React 19 / Pixi.js v8 / Bun 1.2.0 / Vite 6 / vite-plugin-pwa / Cloudflare Pages) は流用、ゲームロジック層 (物理 / 衝突 / プレイヤー / ステージ / 入力 / bitECS world) は Round 6 で全面置換予定。本 Round 5 は **仕様確定 + ドキュメント全面書き直し** に専念する。

## 位置付け

- **目的**: ウェブアプリ開発の事前調査。実装フェーズで参照する単一の真実 (single source of truth)。
- **対象範囲**: ゲームプレイのロジック (盤面 / セル状態 / ヒント / カーソル / クリア判定) と、ロジックを支える Web 基盤 (描画、入力、レスポンシブ、保存) の両方。
- **アート/演出/ナラティブ**: 範囲外。別途資料化する。
- **マルチプレイ / オンラインランキング**: 範囲外 (シングルプレイヤー前提)。将来拡張は §94 アーキテクチャに含む。

## ドキュメント構成

| ファイル | 内容 |
|---|---|
| [00_glossary.md](00_glossary.md) | 用語集 (本ドキュメント全体での標準表記) |
| [10_overview.md](10_overview.md) | プロダクトコンセプト、ジャンル特性、ターゲット、勝利条件 |
| [20_grid-model.md](20_grid-model.md) | 盤面モデル (W×H グリッド、セル状態三値、座標系) |
| [30_hints.md](30_hints.md) | ヒント (行/列の数字列) と事前計算 |
| [40_cursor.md](40_cursor.md) | カーソル + 入力モード (塗 / × / 消) |
| [60_assists.md](60_assists.md) | ヒント補助機能 (手動マーク / 全リセット / 経過時間) |
| [70_viewport.md](70_viewport.md) | ビューポート (固定 / 大盤面のパン/ズーム方針) |
| [80_puzzle-data.md](80_puzzle-data.md) | パズルデータ形式 (正解ビットマップ + 事前計算済ヒント + メタ) |
| [90_input.md](90_input.md) | 入力 (PC: マウス / スマホ: タッチ + モード切替 / KB: 矢印 + Z/X) |
| [91_rendering.md](91_rendering.md) | 描画 (グリッド + 数字 + クリア時カラー演出) |
| [92_audio.md](92_audio.md) | SE (塗 / 消 / クリア) + BGM |
| [93_state-save.md](93_state-save.md) | 進行盤面 + ベストタイム (LocalStorage + debounce) |
| [94_architecture.md](94_architecture.md) | コード構成、Zustand 中心、bitECS 不採用 |
| [95_performance.md](95_performance.md) | 差分描画 / DOM 数 / モバイル熱対策 |
| [96_accessibility.md](96_accessibility.md) | DOM ベース ARIA + キーボード対応、Canvas a11y は v1.1 |
| [97_responsive-crossdevice.md](97_responsive-crossdevice.md) | スマホ ≤10×10、PC+タブレット ≤15×15、タッチ ≥44×44px |
| [98_pixel-modernization.md](98_pixel-modernization.md) | ピクセル概念の現代化 (HD-2D / CRT 演出は流用可) |
| [99_open-questions.md](99_open-questions.md) | 未決事項、Round 5 で削除した旧プラットフォーマー要素の整理 |
| [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md) | Cloudflare Pages デプロイ手順 |

> **削除された旧章 (Round 4 までは存在、Round 5 で削除)**:
> - `30_collision.md` → §30_hints.md (ヒント生成) に置換
> - `40_player.md` → §40_cursor.md に置換
> - `50_enemies.md` → 削除 (§99 に申し送り)
> - `60_items.md` → §60_assists.md に置換
> - `70_camera.md` → §70_viewport.md に置換
> - `80_world.md` → §80_puzzle-data.md に置換
> - 旧 §20_physics.md → §20_grid-model.md に置換 (旧物理コードは Round 6 で削除)

## 設計原則

1. **論理パズルとしての厳密さ** — パズルは解の一意性をツール側で保証し、論理的推論だけで解ける。
2. **クロスデバイス第一** — 入力は抽象化、ビューポートは盤面サイズに応じて自動調整、性能はモバイル基準で設計。
3. **シンプルなデータ駆動** — パズルは JSON で定義 (正解ビットマップ + 事前計算済ヒント + メタ)。ロジックはデータを解釈する側に留める。
4. **a11y を一級として扱う** — DOM 部分は ARIA + キーボード単独完結。Canvas 内 a11y は v1.1 で別途対応。
5. **MVP 範囲を厳しく守る** — Undo / 自動グレーアウト / Canvas a11y / カラーパズル / 大盤面パンズーム は v1.1 以降。

## レビュー履歴

本ドキュメントは Claude が初稿を執筆し、Gemini Pro/Flash-lite で第三者レビューを通したうえで反映している。レビューサマリ・採否は §99 にまとめる。Round 5 のジャンル転換は Gemini Pro deep の独立妥当性検証 (12 論点 final) を経て確定した。
