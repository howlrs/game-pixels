# mario-pixel (game-pixels)

マリオ系ピクセルアート 2D サイドスクロール プラットフォーマー (コード名: **マリオピクセル**) の Web アプリ事前調査。

ゲームロジック仕様書は [`docs/`](docs/00_index.md) にまとめている。本リポジトリはこの仕様を元に Web 実装 (PC/スマホ クロスデバイス) へ進める前段階の資料群である。

## ハイライト

- 物理: SMB1 互換の整数 + subpixel + 60Hz 固定タイムステップ。データレイアウトは Int32Array SoA ([`docs/20_physics.md`](docs/20_physics.md) §2.1.1)。
- 衝突: タイルベース AABB + 軸分離 + サブステップ + ゴーストバーテックス対策。
- 入力: Keyboard / Pointer (Touch) / Gamepad の 3 系統 + リマップ。Gamepad は接続イベント + ポーリング併用 ([`docs/90_input.md`](docs/90_input.md) §9.6.2)。
- 描画: 内部解像度 480×270 px (16:9) を主軸、**WebGPU 既定** → WebGL2 → Canvas2D で段階縮退 ([`docs/91_rendering.md`](docs/91_rendering.md) §11.2)。
- アーキ: **bitECS** で ECS / コア Vanilla + UI Zustand のハイブリッド状態管理 / Valibot Schema-first ([`docs/94_architecture.md`](docs/94_architecture.md) §14.2)。
- 現代化: 物理は古典互換のまま、視覚をクラシック / モダン / HD-2D / CRT で切替可能 ([`98_pixel-modernization.md`](docs/98_pixel-modernization.md))。
- a11y / クロスデバイス対応を一級として扱う ([`96`](docs/96_accessibility.md), [`97`](docs/97_responsive-crossdevice.md))。

## ドキュメント目次

[`docs/00_index.md`](docs/00_index.md) を参照。

## 進行体制

- 初稿は Claude が執筆、各章単位で Gemini Pro / Flash-lite に第三者レビューを通して反映する。
- レビュー結果と未決事項は [`docs/99_open-questions.md`](docs/99_open-questions.md) に集約する。
- 章ごとに GitHub Issue を起票し、トピックブランチ → PR → main マージ → タグ付け の運用で履歴を残す。

### バージョン

| Tag | 状態 |
|---|---|
| `v0.1.0-draft` | 初稿 (Gemini レビュー前) |
| `v0.2.0-docs-round1` | Gemini Pro Round1 レビュー反映済み (Issue #1/#2/#3, PR #4/#5/#6) |
| `v0.3.0-docs-round2` | Round 2 / T1 (Issue #11, PR #17) + T5 (Issue #10) 反映予定 — WebGPU 既定 / bitECS / ハイブリッド状態管理 / Valibot / Vite 6 系 / dvh-svh / PWA 範囲縮小 / 確定スタック表 |

## 依存パッケージ運用ポリシー

実装着手以降、本リポジトリの依存パッケージは以下のポリシーで管理する (詳細は [`docs/94_architecture.md`](docs/94_architecture.md) §14.14):

- **絶対バージョン指定**: `package.json` のすべての依存に絶対バージョンを記載 (例: `"react": "19.0.0"`)。caret `^` / tilde `~` は **禁止**。
- **ロックファイル**: `bun.lockb` を Git 管理する。
- **依存追加**: `bun add <pkg>@<version>` で常に絶対指定する。
- **更新運用**: Renovate で自動 PR を発行 (パッチ即時/週次自動マージ、マイナー月次、メジャー手動)。
- **CI 必須通過**: E2E (Playwright) と `bun test` が両方通ったときのみ Renovate PR の自動マージを許可する。

## ライセンス

[MIT License](LICENSE)。実装着手時にライブラリ依存を勘案して再確認する。
