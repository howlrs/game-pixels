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

JSON を採用 (人間可読、ツールで生成しやすい、フェッチで配信容易)。実行時は内部表現にデコード。**ロード時には必ず Valibot スキーマで検証する** (§8.2.2 / §94.2.3)。

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
- 配信フォーマットは **リトルエンディアン固定**。`Uint16Array` の生バッファをそのまま base64 化するとホスト CPU のエンディアンに依存して破損するため、デコード時は **`DataView` 経由で `getUint16(i, true)` (true = LE)** を使い、内部 `Uint16Array` に詰め直す。エンコード側 (ツール) も同じく `setUint16(i, v, true)` を使う。
- 編集ツール (将来) は別 JSON スキーマで持っても良い。

### 8.2.2 Valibot Schema-first バリデーション (Round 2 / Issue #11)

ステージ JSON は Valibot で **Schema-first** に定義する。スキーマからゲーム側の TS 型を `Output<typeof StageSchema>` で生成し、レベルエディタ (将来) と同じ型をシェアする (Round 2 / E8, E9 専門家見解)。

```ts
// game/world/stage-schema.ts
import * as v from 'valibot';

const Pos = v.object({
  x: v.pipe(v.number(), v.integer(), v.minValue(0)),
  y: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const Entity = v.variant('type', [
  v.object({ type: v.literal('goomba'),         ...Pos.entries }),
  v.object({ type: v.literal('koopa_green'),    ...Pos.entries }),
  v.object({ type: v.literal('koopa_red'),      ...Pos.entries }),
  v.object({ type: v.literal('question_block'), ...Pos.entries,
             contents: v.picklist(['coin', 'mushroom', 'fire_flower', 'star', '1up']) }),
  v.object({ type: v.literal('pipe_warp'),      ...Pos.entries,
             to: v.object({
               area: v.string(),
               x: v.pipe(v.number(), v.integer(), v.minValue(0)),
               y: v.pipe(v.number(), v.integer(), v.minValue(0)),
             }) }),
  // ...
]);

const Trigger = v.variant('type', [
  v.object({ type: v.literal('checkpoint'),         ...Pos.entries }),
  v.object({ type: v.literal('auto_scroll_start'),  ...Pos.entries,
             vx: v.pipe(v.number(), v.minValue(0), v.maxValue(4)) }),
  v.object({ type: v.literal('goal'),               ...Pos.entries }),
  v.object({ type: v.literal('warp'),               ...Pos.entries,
             to: v.object({ area: v.string(), x: v.number(), y: v.number() }) }),
]);

const Area = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  size: v.object({
    w: v.pipe(v.number(), v.integer(), v.minValue(16), v.maxValue(8192)),
    h: v.pipe(v.number(), v.integer(), v.minValue(14), v.maxValue(64)),
  }),
  background: v.string(),
  music: v.string(),
  tiles: v.string(),                // base64 (LE u16, §8.2.1)
  tilemap_palette: v.array(v.string()),
  entities: v.array(Entity),
  triggers: v.array(Trigger),
});

export const StageSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^\d+-\d+$/)),     // 例: "1-1"
  name: v.string(),
  areas: v.pipe(v.array(Area), v.minLength(1)),
  scroll_lock_left: v.optional(v.boolean(), true),
});

export type Stage = v.InferOutput<typeof StageSchema>;
```

### 8.2.3 ロード時の検証フロー

```ts
// game/world/load-stage.ts
import * as v from 'valibot';
import { StageSchema, type Stage } from './stage-schema';

export async function loadStage(url: string): Promise<Stage> {
  const res = await fetch(url);
  if (!res.ok) throw new StageLoadError('FETCH_FAILED', url);
  const raw: unknown = await res.json();
  const parsed = v.safeParse(StageSchema, raw);
  if (!parsed.success) {
    // §94.2.3 のフロー: 拒否 + ユーザー通知 + テレメトリ
    throw new StageLoadError('SCHEMA_INVALID', url, parsed.issues);
  }
  return parsed.output;
}
```

- **失敗時**: 物理層には絶対に流さない (NaN 伝播による決定論破壊を防ぐ, §9.9 と同じ原則)。
- **`tiles` の整合性**: スキーマ通過後に `base64 → Uint16Array (LE)` のデコード結果が `area.size.w * area.size.h * 2` バイトに一致するかを **2 段階目の検証** で確認する。Valibot だけでは長さ整合は表現しにくいため、デコード後に追加チェック。
- **`entities[*].x/y` の範囲**: スキーマで `minValue(0)` のみ表現し、上限 `area.size.w/h` との整合は 2 段階目で確認 (cross-field validation)。
- **将来の CI 拡張**: ステージ JSON を git 管理する場合、CI で `bun test` 内に `loadStage` を呼び出すバリデーションテストを追加し、不整合な JSON が main にマージされるのを構造的に防ぐ (詳細は Round 2 / Issue #14 → §95.6)。

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
