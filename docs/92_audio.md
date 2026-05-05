# 92. オーディオ

## 12.1 設計目標

- ブラウザの自動再生制限を確実に回避する (初回操作で AudioContext 再開)。
- BGM/SE のトラック分離。BGM は 1 系統、SE は最大 8 系統同時再生。
- 低レイテンシ (< 50ms; ジャンプ→着地音、敵踏み→効果音)。
- ファイルフォーマットは Ogg Vorbis (主) + Mp4/AAC (Safari 互換)。圧縮率優先で軽量化。

## 12.2 構成

- Web Audio API を使用。`AudioContext` 1 個。
- マスタゲイン → BGM ゲイン / SE ゲイン → 各音源。
- BGM: `AudioBufferSourceNode` (loop) + `MediaElementAudioSourceNode` (長尺 BGM 用) のどちらかを選ぶ。MVP は AudioBuffer (短尺ループ前提)。
- SE: `AudioBufferSourceNode` のプール (使い回し)。

## 12.3 自動再生制限

```ts
on_first_user_input:
    if AudioContext.state === 'suspended': await AudioContext.resume()
    play_silence_buffer()  # 一部ブラウザでは無音再生でアンロック
```

- 初回フレームで「タップしてスタート」を表示し、AudioContext をユーザー操作で起動する。

## 12.4 BGM 切替

- ステージ開始/終了で **クロスフェード** (12 frame, 200ms)。
- ボス戦に入ると BGM 切替。
- タイマー残 100 以下で **BGM テンポ 1.25 倍** (PlaybackRate or 別バッファ用意)。古典互換。
- ポーズ時は BGM を suspend する (フェードはしない)。

## 12.5 SE カタログ (MVP)

| イベント | SE |
|---|---|
| ジャンプ | jump_small / jump_super |
| 着地 (重い時) | thud |
| コイン | coin |
| アイテム取得 | powerup |
| 1UP | one_up |
| 敵踏み | stomp |
| 甲羅蹴り | shell_kick |
| ブロック頭突き | bump |
| ブロック破壊 | break |
| ファイア弾 | fireball |
| ダメージ | hit |
| 死亡 | die |
| クリア | level_clear / world_clear |
| ポーズ | pause |
| ゲームオーバー | game_over |

## 12.6 SE プール

- ノード生成のオーバーヘッドを避けるため、SE は再利用プールを持つ。
- 同時再生上限 (8) を超えた場合、優先度の低い既存 SE を停止。
- ピッチ揺らぎ (微小ランダム): 連続コインで `playbackRate ∈ [0.97, 1.03]` ランダム化、聴覚疲労低減。

## 12.7 ボリュームと a11y

- マスタ / BGM / SE の独立ボリュームを設定で提供。
- "Mute on tab inactive" デフォルト ON (ユーザー切替可能)。
- 字幕 (SFX 表示) を a11y 設定で ON 可能 (§96): 重要な SE 発生時に画面端にテキスト表示 (例: "コイン!")。

## 12.8 ロード戦略

- 起動時に 「最低限必要な SE」 (jump, coin, hit, die) のみロード。
- BGM はステージ開始前に `await` でフェッチ + decode。
- 大きい BGM は `AudioBuffer.decodeAudioData` ではなく Streaming (`MediaElementSource`) で対応 (将来)。

## 12.9 オーディオレイテンシ計測

- 開発時に `AudioContext.outputLatency` と `baseLatency` を HUD に表示する。
- iOS Safari は `outputLatency` が大きいため、iOS では音声再生キューを少し早めるオフセットを実装 (経験的: 30〜50ms 早める)。

## 12.10 既知の罠と対策

| 罠 | 対策 |
|---|---|
| 初回フレームで音が鳴らない | 「タップでスタート」必須 |
| iOS でロックが外れない | 無音バッファを 1 度再生してから本体再生 |
| Bluetooth 出力で遅延 250ms+ | レイテンシ補正は不能。視覚で代替 (フラッシュ等) |
| AudioContext がタブ非アクティブで停止 | 復帰時に resume |
| 多重 SE で歪む | プール上限 8、必要に応じて gain で混合 |
