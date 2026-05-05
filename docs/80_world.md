# 80. ワールド/ステージ

## 8.1 階層構造

```
Game
└─ Save (1 ファイル)
   └─ Profile
      └─ World[]
         └─ Stage[]
            └─ Area[]    # 地上/地下/水中の遷移単位
               └─ Tile[][], Entity[], Trigger[]
```

- Save = アカウントデータ単位 (§93)。
- World = ワールド (1-8 などの群)。
- Stage = ステージ。1-1, 1-2 などの単位。
- Area = エリア。例: 地上 → 配管で地下エリア → 配管で地上エリア (大階層は同じ Stage 内)。
- Tile = 16×16 px。
- Entity = 敵/アイテム/オブジェクト。
- Trigger = ステージ内のイベント発火点 (チェックポイント、エリア遷移、自動スクロール開始等)。

## 8.2 データ形式

JSON を採用 (人間可読、ツールで生成しやすい、フェッチで配信容易)。実行時は内部表現にデコード。

```json
{
  "id": "1-1",
  "name": "World 1-1",
  "areas": [
    {
      "id": "main",
      "size": { "w": 224, "h": 14 },        // タイル単位
      "background": "overworld_day",
      "music": "overworld_theme",
      "tiles": "<base64 of u16 tile ids, row-major>",
      "tilemap_palette": ["empty","ground","brick","question_coin","pipe_top_left", "..."],
      "entities": [
        { "type": "goomba", "x": 22, "y": 12 },
        { "type": "question_block", "x": 16, "y": 9, "contents": "mushroom" },
        { "type": "pipe_warp", "x": 28, "y": 12, "to": { "area": "underground", "x": 2, "y": 2 } }
      ],
      "triggers": [
        { "type": "checkpoint", "x": 100, "y": 12 },
        { "type": "auto_scroll_start", "x": 150, "y": 0, "vx": 1.0 },
        { "type": "goal", "x": 220, "y": 12 }
      ]
    },
    {
      "id": "underground",
      "size": { "w": 32, "h": 14 },
      "background": "underground",
      "music": "underground_theme",
      "tiles": "...",
      "entities": [],
      "triggers": [
        { "type": "pipe_warp", "x": 28, "y": 12, "to": { "area": "main", "x": 200, "y": 12 } }
      ]
    }
  ],
  "scroll_lock_left": true
}
```

### 8.2.1 タイル ID の符号化

- 16 bit のタイル ID。下位 12 bit = タイル種別、上位 4 bit = 属性フラグ (反転、衝突上書き)。
- ブラウザでも `Uint16Array` で扱えるため、配信は base64 + バイト順固定。
- 編集ツール (将来) は別 JSON スキーマで持っても良い。

## 8.3 ステージ遷移

### 8.3.1 ゴール

- ゴール (旗ポール / ゴール建造物) 接触で操作不能化。
- 旗を降ろすアニメーション (約 2 秒) → 残り時間を 50 点ずつスコアに変換 → 次のステージへ。

### 8.3.2 配管 (Pipe Warp)

- 配管入口で Up/Down 入力 + プレイヤー位置がほぼ中央 (±4 px) のとき遷移開始。
- 0.5 秒の入る演出 → 別 Area の出口位置にスポーン → 0.5 秒の出る演出。
- 演出中は物理停止、操作不能。

### 8.3.3 隠しゾーン

- 一部ステージは「上方の天井をすり抜けて空中エリアへ」等の隠し遷移を持つ。Trigger として明示 (`type: "warp"`).

## 8.4 自動スクロール

- `auto_scroll_start` トリガー以降、カメラが固定速度で右に進む。
- プレイヤーが画面左端に押し出されたら即死。

## 8.5 チェックポイント

- 中間旗 (`mid_flag`) 通過で `checkpoint_x` を保存。
- リスポーン時は `max(stage.start_x, checkpoint_x)` の位置に。
- セーブデータには「最後にクリアしたステージ」のみを永続化し、チェックポイントはセッション内のみ (§93)。

## 8.6 シーン状態機械

```
[Title] → [WorldMap] → [StagePlay] → [StageClear] → [WorldMap] (or [Ending])
                            ↓
                         [Pause]
                            ↓
                         [GameOver] → [WorldMap]
```

- WorldMap (ステージ選択画面) は MVP 範囲。SMB3 風のマップ移動でも、SMB1 風の「クリアで自動的に次へ」のどちらでも採用可能 (実装選択肢; §99)。

## 8.7 シーン遷移時のロジック

- StagePlay 開始時: ステージ JSON をフェッチ (PWA キャッシュから or ネットワークから) → デコード → 物理ワールド初期化 → BGM 切替 → カメラを Stage 開始位置にスナップ → 物理ループ開始。
- StagePlay 終了時: 物理ループ停止、BGM フェードアウト、エンタイトルメント (スコア合算) を Save に書き込み。

## 8.8 デバッグ機能 (開発専用)

- ステージスキップ (Konami コード等)。
- ステージ位置の可視化 (デバッグオーバーレイで AABB を表示)。
- 入力リプレイのインポート/エクスポート (§94)。
