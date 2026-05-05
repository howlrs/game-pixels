# pixels (game-pixels)

汎用ノノグラム (ピクチャーロジック) の Web アプリ (コード名: **ピクセルズ**)。

- 仕様書: [`docs/`](docs/00_index.md) (Round 5 = ピクセルズ仕様確定)
- 用語集: [`docs/00_glossary.md`](docs/00_glossary.md)
- デプロイ手順: [`docs/CLOUDFLARE_DEPLOY.md`](docs/CLOUDFLARE_DEPLOY.md)
- Live demo: (Cloudflare Pages デプロイ後に更新)

## 経緯 (ジャンル転換)

本リポジトリは Round 1〜4 で 2D サイドスクロール プラットフォーマー (旧コード名: マリオピクセル) として仕様策定 + 実装スケルトン + MVP α まで完成させていたが、Round 5 でジャンルを **汎用ノノグラム** に全面転換した。任天堂 IP は使用しない (詳細は [`docs/10_overview.md`](docs/10_overview.md) §1.6)。

実装の置換は **Round 6** で実施 (本 Round 5 は仕様確定 + docs 全面書き直しに専念)。

## クイックスタート (ローカル開発)

```bash
bun install
bun run dev      # https://127.0.0.1:5173 (自己署名証明書、PWA secure context)
bun test         # 単体テスト
bun run build    # production build (dist/)
bun run preview  # production build を local で配信 (https://127.0.0.1:4173)
```

詳細は [`docs/94_architecture.md`](docs/94_architecture.md) §14.9 ビルドとバンドル。

## ハイライト

- **ジャンル**: 汎用ノノグラム (ピクチャーロジック)、5×5 / 10×10 / 15×15 / 25×25 の盤面 ([`docs/10_overview.md`](docs/10_overview.md))
- **盤面モデル**: 三値セル (空 / 塗 / ×)、形状で区別 ([`docs/20_grid-model.md`](docs/20_grid-model.md))
- **ヒント**: パズル JSON に事前計算済の行/列ヒント配列を埋め込み (run-length encoding、[`docs/30_hints.md`](docs/30_hints.md))
- **入力**: Mouse (PC) / Keyboard / Touch (スマホ + モード切替ボタン)、Undo/Redo (Cmd/Ctrl+Z/Y, β5.0)、ズーム+パン UI (Pinch / Wheel / HUD ボタン, β10.0) ([`docs/90_input.md`](docs/90_input.md))
- **描画**: 内部解像度動的化 (5×5: 480 / 10×10: 600 / 15×15: 720 / 25×25: 1000)、**WebGPU 既定** → WebGL2 → Canvas2D で段階縮退 ([`docs/91_rendering.md`](docs/91_rendering.md))
- **音声**: WebAudio 自前合成 (SE: synth.ts, BGM: bgm.ts / chiptune アンビエント, β11.0) — bundle 0 KB / PWA オフライン保持 ([`docs/92_audio.md`](docs/92_audio.md))
- **アーキ**: Zustand 中心 (bitECS 不採用、Round 6 で削除) / Valibot Schema-first ([`docs/94_architecture.md`](docs/94_architecture.md))
- **セーブ**: LocalStorage + debounce、進行盤面 + Undo/Redo 履歴 + ベストタイム ([`docs/93_state-save.md`](docs/93_state-save.md))
- **a11y**: ARIA + キーボード操作 + reduce-motion (β3.0) + ハイコントラスト (β4.0) + WCAG AAA 対応 ([`docs/96_accessibility.md`](docs/96_accessibility.md))
- **クロスデバイス**: スマホは ≤10×10、PC+タブレットは 25×25 まで、タッチ ≥44×44px / β10.0 でズーム+パン UI 追加 ([`docs/97_responsive-crossdevice.md`](docs/97_responsive-crossdevice.md))
- **パズル QA**: 自動生成・既存問わず一意性 / 論理可解性 / 可視性 / 対称性を CI で強制 ([`docs/QA_SUITE.md`](docs/QA_SUITE.md))

## ドキュメント目次

[`docs/00_index.md`](docs/00_index.md) を参照。

## 進行体制

- 初稿は Claude が執筆、各章単位で Gemini Pro / Flash-lite に第三者レビューを通して反映する。
- レビュー結果と未決事項は [`docs/99_open-questions.md`](docs/99_open-questions.md) に集約する。
- 章ごとに GitHub Issue を起票し、トピックブランチ → PR → main マージ → タグ付け の運用で履歴を残す。

### バージョン (Round 5 ジャンル転換時に旧タグを全削除)

| Tag | 内容 |
|---|---|
| `v0.6.0-pixels-spec` | Round 5 = ピクセルズ仕様確定 (docs 全面書き直し) |
| `round1` 〜 `round7` | Round 6/7 = 旧コード削除 + MVP 実装 + パズル QA 整備 |
| `β2.0` | HUD レイアウト分離 / 音声 SE / 共有 / 設定モーダル |
| `β3.0` | ライン完了表示 / reduce-motion / 進捗% |
| `β4.0` | ヘルプモーダル / ハイコントラスト |
| `β5.0` | Undo / Redo (Cmd/Ctrl+Z/Y) |
| `β6.0` | 動的 canvas 解像度 / クリアマーク復元 |
| `β7.0` | 一時停止 (visibility 自動 paused) |
| `β8.0` | Undo/Redo 履歴を autoSave に統合 + autoSave バグ修正 |
| `β9.0` | 画像→パズル変換パイプ (sharp 導入) |
| `β10.0` | ズーム+パン UI (Pinch / Wheel / HUD ボタン) |
| `β11.0` | BGM (WebAudio 自前合成 / chiptune アンビエント) |

> **旧プラットフォーマー仕様のタグ** (`v0.1.0-draft` / `v0.2.0-docs-round1` / `v0.3.0-docs-round2` / `v0.4.0-skeleton` / `v0.5.0-mvp-alpha`) は Round 5 ジャンル転換時に削除済 (混乱回避)。git 履歴は残るので必要なら `git log` で参照可能。

## 依存パッケージ運用ポリシー

実装着手以降、本リポジトリの依存パッケージは以下のポリシーで管理する (詳細は [`docs/94_architecture.md`](docs/94_architecture.md) §14.14):

- **絶対バージョン指定**: `package.json` のすべての依存に絶対バージョンを記載 (例: `"react": "19.0.0"`)。caret `^` / tilde `~` は **禁止**。
- **ロックファイル**: `bun.lock` (Bun 1.3+ の text 形式) を Git 管理する。
- **依存追加**: `bun add <pkg>@<version>` で常に絶対指定する。
- **更新運用**: Renovate で自動 PR を発行 (パッチ即時/週次自動マージ、マイナー月次、メジャー手動)。
- **CI 必須通過**: E2E (Playwright) と `bun test` が両方通ったときのみ Renovate PR の自動マージを許可する。

## ライセンス

[MIT License](LICENSE)。実装着手時にライブラリ依存を勘案して再確認する。
