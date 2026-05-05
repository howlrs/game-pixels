# 70. ビューポート (Viewport)

## 7.1 ビューポートとは

ピクセルズの **ビューポート** は、画面に表示される領域。ノノグラムでは盤面が常に全体表示できるサイズ (≤15×15) であることが MVP 前提のため、**カメラ追従や横スクロールは不要**。

ただし、盤面サイズに応じて拡大/縮小する **オートフィット** が必要。

## 7.2 オートフィットの方針

ビューポート (利用可能な画面領域) と盤面のサイズから、最適な「セルあたり px」を計算:

```typescript
// MVP の最小実装 (Round 6 で実装):

interface ViewportSize {
  width: number;   // 画面幅 (px)
  height: number;  // 画面高 (px)
}

interface BoardLayout {
  cellPx: number;       // 1 セルあたりのピクセル数 (整数)
  hintAreaTopPx: number;   // 上ヒント領域の高さ
  hintAreaLeftPx: number;  // 左ヒント領域の幅
  totalWidthPx: number;
  totalHeightPx: number;
}

export function computeBoardLayout(
  viewport: ViewportSize,
  boardWidth: number,
  boardHeight: number,
  rowCluesMaxLen: number,    // 最も長い行ヒントの数字数
  colCluesMaxLen: number,    // 最も長い列ヒントの数字数
  hudReservePx: number = 60,  // HUD (上部経過時間) の予約領域
  controlReservePx: number = 80, // モード切替ボタン (下部) の予約領域
): BoardLayout {
  // ヒント領域 = 数字 1 つあたり cellPx の半分くらいを目安
  // セルサイズの計算: 盤面 + ヒント領域 が viewport に収まる最大整数値
  const availableWidth = viewport.width - 16; // 左右 8px マージン
  const availableHeight = viewport.height - hudReservePx - controlReservePx - 16;

  // hintAreaLeftPx ≈ rowCluesMaxLen * cellPx * 0.5 (= cellPx の半分)
  // hintAreaTopPx ≈ colCluesMaxLen * cellPx * 0.5
  // ↓ 連立方程式 (cellPx を 1 変数として解く) を簡略化:
  const cellByWidth = availableWidth / (boardWidth + rowCluesMaxLen * 0.5);
  const cellByHeight = availableHeight / (boardHeight + colCluesMaxLen * 0.5);
  const cellPx = Math.max(20, Math.floor(Math.min(cellByWidth, cellByHeight)));
  // 最小 20px (WCAG 44px 基準は満たさないが、5×5 / 10×10 でスマホ操作可能な現実妥協値)

  const hintAreaLeftPx = Math.ceil(rowCluesMaxLen * cellPx * 0.5);
  const hintAreaTopPx = Math.ceil(colCluesMaxLen * cellPx * 0.5);

  return {
    cellPx,
    hintAreaTopPx,
    hintAreaLeftPx,
    totalWidthPx: hintAreaLeftPx + boardWidth * cellPx,
    totalHeightPx: hintAreaTopPx + boardHeight * cellPx,
  };
}
```

## 7.3 サイズ別の想定 cellPx (5 インチスマホ ~ デスクトップ)

| デバイス | viewport (px) | 5×5 | 10×10 | 15×15 |
|---|---|---|---|---|
| スマホ縦 (iPhone 12 = 390x844) | 390x844 - HUD - controls ≈ 390x720 | 56px | 28px | 18px ⚠ |
| スマホ縦 (iPhone SE = 375x667) | 375x667 ≈ 375x540 | 50px | 25px | 16px ⚠ |
| タブレット (iPad = 768x1024) | 768x1024 ≈ 768x880 | 80px | 60px | 40px ✅ |
| デスクトップ (1920x1080) | 1920x1080 (window) | 120px | 90px | 60px ✅ |

> **⚠ MVP 仕様 (§97)**: スマホで 15×15 (cellPx < 20) は WCAG 44px を大幅に下回るため、操作性が著しく低下。Round 5 / Gemini Pro deep の指摘により **スマホは 5×5〜10×10 限定** とし、15×15 はスマホで「非対応」と表示する。

## 7.4 大盤面 (15×15) のスマホ対応 (v1.1)

MVP では 15×15 のスマホ対応は非サポート (パズル選択画面でグレーアウト)。v1.1 で以下のいずれかを実装検討:

1. **ピンチイン/アウト + パン**: Pixi.js の Container を transform で操作。タッチ ≥44×44px を維持
2. **横画面強制**: 画面回転で landscape にすれば 15×15 もスマホで操作可能 (cellPx ≈ 30px)
3. **盤面分割 (= 任天堂「ワリオの挑戦」式)**: 15×15 を 5×5 のサブ盤面に分割し、1 サブ盤面ずつ解く

## 7.5 横スクロール / 縦スクロール (MVP では不要)

旧プラットフォーマー仕様 (Round 4) では「カメラ追従 + デッドゾーン + 自動スクロール」を §70_camera に書いていたが、ノノグラムでは:

- 盤面が常に全体表示できるサイズ (≤15×15)
- スクロール不要
- パン/ズームも v1.1 以降

## 7.6 旧仕様との対応

| 旧 §70_camera (プラットフォーマー) | 新 §70_viewport (ノノグラム) |
|---|---|
| カメラ追従 (プレイヤー位置) | なし (盤面が固定表示) |
| デッドゾーン (中央 33%) | なし |
| 自動スクロール (右進行) | なし |
| 垂直追従 (ジャンプ時) | なし |
| カメラスナップ / 補間 | なし |

旧 §70_camera の全内容は **削除** (Round 6 で旧コード削除)。本章はそれに代わる新仕様。
