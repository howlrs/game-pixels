# Cloudflare Pages デプロイ手順

docs §14.15 (デプロイターゲット) で確定した方針に基づく、本リポジトリを Cloudflare Pages にデプロイする手順。

## 前提

- リポジトリ: `howlrs/game-pixels` (GitHub)
- Cloudflare アカウント (Free プランで MVP は完結)
- Bun 1.2.0 がビルドに必要 (Pages の Environment Variables で指定)

## 1. Pages プロジェクトの作成 (初回のみ)

1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. GitHub の `howlrs/game-pixels` リポジトリを選択
3. **Set up builds and deployments** で以下を入力:

| 項目 | 値 |
| :--- | :--- |
| **Project name** | `mario-pixel` (任意) |
| **Production branch** | `main` |
| **Framework preset** | None (Bun + Vite を手動指定) |
| **Build command** | `bun install --frozen-lockfile && bun run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` |

4. **Environment variables** (Production / Preview の両方で設定):

| Variable | Value | 備考 |
| :--- | :--- | :--- |
| `BUN_VERSION` | `1.2.0` | docs §14.14.1 で固定。**未設定だとビルドが最新 Bun で走り、lockfile 互換性が壊れる可能性あり** |
| `NODE_VERSION` | `20` | bun が内部で使う Node ベース (推奨) |

5. **Save and Deploy** → 初回ビルドが走る (約 1〜2 分)

## 2. デプロイ後の確認 (Step F の合格条件)

Pages から付与される URL (例: `mario-pixel.pages.dev`) で以下を順に確認する。docs §14.10 / §14.15.6 / Step E (PR #26) で Gemini Pro が指摘した 2 項目 (オフラインリロード / 再デプロイ時 SW 更新) を重点確認。

### 2.1 基本動作

- [ ] `https://<project>.pages.dev/` を開いて TAP TO START が表示
- [ ] タップ → ステージ全景表示 + プレイヤー操作可能
- [ ] HUD の FPS が 60 (デスクトップ) / 30 以上 (低スペックモバイル)
- [ ] WebGPU 対応ブラウザ (Chrome 最新) で console に `rendererType: webgpu` ログ
- [ ] Safari (macOS / iOS) で WebGL2 fallback が動作

### 2.2 PWA / Service Worker

- [ ] DevTools → Application → Service Workers に `sw.js` が `activated` 表示
- [ ] DevTools → Application → Cache Storage に precache の 17 entries (約 660 KiB)
- [ ] Manifest が読み込まれている (`Application → Manifest`)
- [ ] アイコン (`icon-192.svg` / `icon-512.svg`) が表示

### 2.3 オフライン動作 (重点 / Gemini #1 強調)

- [ ] DevTools → Network → Offline チェック → ページリロード → ゲームが起動する
- [ ] オフラインのまま `/stages/1-1.json` がロードされる (precache 済)

### 2.4 再デプロイ時の SW 更新 (重点 / Gemini #2 強調)

- [ ] 何か小さい変更を `main` に push して再デプロイ
- [ ] 既存タブをリロード → DevTools → Application → Service Workers に `waiting to activate` の新 SW
- [ ] `vite-plugin-pwa` の `registerType: 'autoUpdate'` により、ユーザーがリロードすれば自動で新 SW に切り替わる
- [ ] 旧キャッシュ (`workbox-*.js` / 古い hashed assets) が削除される

### 2.5 ヘッダ確認

- [ ] `curl -I https://<project>.pages.dev/` → `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: require-corp`
- [ ] `curl -I https://<project>.pages.dev/sw.js` → `Cache-Control: public, max-age=0, must-revalidate`
- [ ] `curl -I https://<project>.pages.dev/assets/index-*.js` → `Cache-Control: public, max-age=31536000, immutable`

## 3. Preview デプロイ (PR ごと)

- main 以外のブランチを push すると、Pages が自動的に preview URL を生成 (例: `<branch-hash>.mario-pixel.pages.dev`)
- preview URL は `X-Robots-Tag: noindex` が自動付与される (検索エンジンに登録されない)
- PR の Conversation に Cloudflare bot が preview URL をコメント

## 4. カスタムドメイン (任意)

- Pages → Custom domains → Set up a custom domain
- Cloudflare で管理しているドメインなら DNS 自動設定
- Free プランで 100 個までのカスタムドメインに対応 (docs §14.15.1)

## 5. 環境変数の追加 (将来)

v1.1 でクラウドセーブ等を導入する場合 (docs §14.15.2):

| Variable | 用途 | 備考 |
| :--- | :--- | :--- |
| `VITE_CLOUDFLARE_D1_BINDING` | D1 のバインディング名 | Pages Functions 経由 |
| `VITE_FIREBASE_API_KEY` | Firebase Auth API Key | 公開可 (rules で守る) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | 公開可 |

(`VITE_` プレフィックスはクライアント側に埋め込まれる Vite の規約。秘密値には使わない)

### 5.1 COEP `require-corp` と外部認証連携の留意点 (Step F / Gemini Pro 指摘)

`_headers` で全パスに **`Cross-Origin-Embedder-Policy: require-corp`** を設定している (WebGPU + 将来 SharedArrayBuffer のため)。これにより以下の現象が発生し得る:

- **Firebase Auth の Popup/Redirect ログイン**: Google / Apple のログインフローで開かれる popup/iframe 側のレスポンスが `Cross-Origin-Resource-Policy: cross-origin` (または相応の埋め込み許可) を返さないと、ブラウザがブロックする
- **外部 CDN からのスクリプト/画像/フォント**: 同上。相手側の CORP ヘッダ次第

**v1.1 で実問題になった場合の選択肢**:

1. **`COEP: credentialless` に緩和** (推奨): `require-corp` よりも要件が緩く、第三者リソースが CORP ヘッダを返さなくても CORS で通せれば埋め込み可能。WebGPU は通常通り使える
2. **`COEP` 自体を外す**: WebGPU 一部機能と SharedArrayBuffer (= マルチスレッド WASM) が使えなくなるが、本作 MVP の範囲では影響軽微
3. **Firebase Auth を Custom Token + redirect で実装**: popup を使わない方法を選ぶ

実装着手時に Firebase Auth を導入したらまず実機で popup ログインを試し、ブロックされたら 1 → 3 の順で対応する。本ドキュメントを更新すること。

## 6. トラブルシュート

- **ビルドが Node.js を使ってしまう** → `BUN_VERSION` 環境変数が未設定。Production / Preview の両方を確認
- **WebGPU が動かない** → `Cross-Origin-Embedder-Policy` が `require-corp` でないと WebGPU が一部機能制限を受ける。`_headers` を確認
- **SW が更新されない** → `sw.js` の Cache-Control が長期キャッシュになっていないか確認 (`_headers` で `must-revalidate` 強制)
- **オフラインで動かない** → Cache Storage に entries が無い → DevTools の Service Workers タブで「Update on reload」して再登録
- **CI が落ちる** → `.github/workflows/ci.yml` で `bun-version: '1.2.0'` 固定。`bun.lock` が古いと `--frozen-lockfile` で失敗するので最新を commit
