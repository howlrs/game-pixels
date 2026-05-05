# mario-pixel (game-pixels)

マリオ系ピクセルアート 2D サイドスクロール プラットフォーマー (コード名: **マリオピクセル**) の Web アプリ事前調査。

ゲームロジック仕様書は [`docs/`](docs/00_index.md) にまとめている。本リポジトリはこの仕様を元に Web 実装 (PC/スマホ クロスデバイス) へ進める前段階の資料群である。

## ハイライト

- 物理: SMB1 互換の整数 + subpixel + 60Hz 固定タイムステップ。
- 衝突: タイルベース AABB + 軸分離 + サブステップ + ゴーストバーテックス対策。
- 入力: Keyboard / Pointer (Touch) / Gamepad の 3 系統 + リマップ。
- 描画: 内部解像度 480×270 px (16:9) を主軸、Canvas2D → WebGL → WebGPU で段階縮退。
- 現代化: 物理は古典互換のまま、視覚をクラシック / モダン / HD-2D / CRT で切替可能 ([`98_pixel-modernization.md`](docs/98_pixel-modernization.md))。
- a11y / クロスデバイス対応を一級として扱う ([`96`](docs/96_accessibility.md), [`97`](docs/97_responsive-crossdevice.md))。

## ドキュメント目次

[`docs/00_index.md`](docs/00_index.md) を参照。

## 進行体制

- 初稿は Claude が執筆、各章単位で Gemini Pro / Flash-lite に第三者レビューを通して反映する。
- レビュー結果と未決事項は [`docs/99_open-questions.md`](docs/99_open-questions.md) に集約する。
- 章ごとに GitHub Issue を起票し、トピックブランチ → PR → main マージ → タグ付け の運用で履歴を残す。

## ライセンス

未定 (コード未着手)。実装着手時に決定する。
