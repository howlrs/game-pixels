// docs §11.5.1 / §11.5.2: render/coords.ts の集約箇所 (実装スケルトン段階では core/ 配下に置く)。
// Pixi.js / WebGPU に座標を渡す直前で必ず整数化し、高 DPR シマリングを防ぐ (§17.14 I)。

const SUBPIXEL_SHIFT = 4; // 1 px = 16 subpixel (§2.1)

/**
 * Subpixel 座標 → デバイスピクセル座標の整数化。
 *
 * @param worldSubpixel  ワールド座標 (subpixel 単位、Int32Array SoA 由来)
 * @param cameraSubpixel カメラ座標 (subpixel 単位)
 * @param scale          整数倍スケール (nearest mode 必須)
 * @returns Pixi.js に渡せる整数 px 座標
 */
export function snapToPixel(
  worldSubpixel: number,
  cameraSubpixel: number,
  scale: number,
): number {
  const px = (worldSubpixel - cameraSubpixel) >> SUBPIXEL_SHIFT;
  // | 0 で最終整数化。Pixi.js のレンダラは内部で float に戻すため、
  // ここで整数化していないと DPR=3 で滲む (§11.5.2)。
  return (px * scale) | 0;
}

/**
 * モダンモード (subpixel motion 有効) 用の補間版。
 * scale が整数の nearest mode 時のみ整数化、線形補間モードでは小数を保持する (§11.5.2)。
 */
export function subPixelOffsetForRenderer(
  worldSubpixel: number,
  cameraSubpixel: number,
  scale: number,
  nearestMode: boolean,
): number {
  const dx = (worldSubpixel - cameraSubpixel) / 16; // float の px
  const v = dx * scale;
  return nearestMode ? v | 0 : v;
}
