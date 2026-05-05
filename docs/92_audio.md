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

## 12.3 自動再生制限 (iOS Safari 対策強化, Round 3 / Issue #18)

iOS Safari の自動再生制限は他ブラウザより厳格で、**ユーザージェスチャーのコールバック内で `await` を挟まず同期的に `AudioContext.resume()` を呼ばないと AudioContext は永久に suspended のまま** になる (Round 3 / Gemini Pro deep)。`async`/`await` で直前に I/O を挟んだ瞬間、ジェスチャーフラグが消えて unlock できない。

### 12.3.1 Tap to Start による AudioContext unlock の必須実装

```ts
// ui/tap-to-start.ts
function unlockAudio(audioContext: AudioContext, unlockBuffer: AudioBuffer): void {
  // ⚠ ここで await を挟むと iOS で unlock 失敗。同期呼び出しを徹底する。
  if (audioContext.state === 'suspended') {
    audioContext.resume();  // ジェスチャー内の同期呼び出し
  }
  // 無音バッファを 1 度再生して iOS の unlock を確定させる (古典的なトリック)
  const src = audioContext.createBufferSource();
  src.buffer = unlockBuffer;
  src.connect(audioContext.destination);
  src.start(0);
}

// 起動時の DOM
const startBtn = document.getElementById('tap-to-start')!;
startBtn.addEventListener('pointerdown', () => unlockAudio(audioContext, silentBuffer));
```

- 「Tap to Start」画面 (`<div>` 全画面、ロゴ + "TAP TO START") を必ず初回フレームで表示する。MVP のフローからこの画面を省略しない。
- Howler.js を使う場合: `Howler.autoUnlock = true` (デフォルト) で内部的に同等処理が走るが、**初回 `Howl#play()` をユーザージェスチャーから呼ぶ責務は本作側に残る**。Tap to Start ボタンの `pointerdown` で BGM の最初の `play()` を発火する設計。
- iOS の MediaSession API も同様にユーザージェスチャー必須。MVP では使用しないが将来 BGM をロックスクリーンに出す場合は同じ画面で初期化する。

### 12.3.2 visibilitychange auto-pause + Tap to Resume (バックグラウンド復帰時の音ズレ対策)

スマホがバックグラウンドに回ると OS が AudioContext を停止 / suspend する。**復帰時に `resume()` を呼ばないと無音、または別タイミングで音が鳴り続けて音ズレが発生** する。

ただし `visibilitychange` イベントは **非ユーザージェスチャーイベント** のため、iOS Safari ではそのコールバック内で `audioContext.resume()` を呼んでも flaky にブロックされる場合がある (Round 3 / Gemini Pro 指摘)。よって `visibilitychange` では **`suspend()` のみ実行** し、復帰時は **「TAP TO RESUME」画面のタップハンドラ内で同期 `resume()`** を行う。

```ts
// game/lifecycle/visibility.ts
import { Howler } from 'howler';

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // バックグラウンド移行: ゲーム本体を pause + 音を停止
    pauseGame();              // 物理ループ停止 (§94.13 [Pause] 状態へ)
    Howler.mute(true);        // BGM/SE 全停止 (位置は維持)
    audioContext.suspend();   // AudioContext を明示的に suspend (冪等)
  } else {
    // フォアグラウンド復帰: ここでは resume() を呼ばず、「TAP TO RESUME」画面を表示するのみ。
    // iOS Safari は非ユーザージェスチャーの resume() を flaky にブロックするため、
    // 確実に動かすにはタップハンドラ内の同期 resume() に集約する (§12.3.1 と同じ規律)。
    showResumePrompt();
  }
});

// ui/resume-prompt.ts
const resumeBtn = document.getElementById('tap-to-resume')!;
resumeBtn.addEventListener('pointerdown', () => {
  // ⚠ ジェスチャー内の同期呼び出し。await 禁止。
  audioContext.resume();    // ここで初めて確実に unlock
  Howler.mute(false);
  hideResumePrompt();
  resumeGame();             // 物理ループを再開 (§94.13 [Pause] → [StagePlay])
});
```

- **復帰時にゲームを自動再開しない**理由: ① 物理状態がそのままで操作が始まると、プレイヤーが落下死する事故が起きる。② iOS の AudioContext unlock がユーザージェスチャー必須のため、画面タップを必須化することで音と物理を同時に確実に復帰させる。
- `Howler.mute(true)` ではなく `Howler.stop()` を使うと BGM の再生位置がリセットされてしまう。意図的に位置維持なら mute、意図的にリセットなら stop。
- iOS では `audioContext.suspend()` を呼んでもバックグラウンド時点で OS 側が既に suspend している場合があり、no-op になることがある。安全側の冪等呼び出し。
- `audioContext.resume()` の戻り値 Promise は **await しない** こと (await を挟むとジェスチャーフラグが消える)。ハンドラ内では fire-and-forget。

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
| 初回フレームで音が鳴らない | 「Tap to Start」必須 (§12.3.1) |
| iOS でロックが外れない | 無音バッファを 1 度再生 + `await` 禁止の同期 `resume()` (§12.3.1) |
| iOS で `await` を挟むとロック外れない | ジェスチャーコールバック内で同期呼び出しを徹底 (§12.3.1) |
| Bluetooth 出力で遅延 250ms+ | レイテンシ補正は不能。視覚で代替 (フラッシュ等) |
| AudioContext がタブ非アクティブで停止 | `visibilitychange` で suspend/resume + ゲーム自動再開はせず "TAP TO RESUME" 表示 (§12.3.2) |
| バックグラウンド復帰で音ズレ | resume 後に Howler.mute(false) → ユーザー操作で再開 (§12.3.2) |
| 多重 SE で歪む | プール上限 8、必要に応じて gain で混合 |
