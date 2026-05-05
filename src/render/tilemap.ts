// docs §11.7 Tile (foreground) layer の MVP 描画。
// タイル種別 → 色 の最小マッピングで Pixi.js Container に矩形 sprite を敷き詰める。
// Step E 以降でスプライトアトラスに置換する。

import { Container, Graphics, Sprite as PixiSprite, type Application, type Texture } from 'pixi.js';
import type { StageArea, TileKind } from '@core/stage/schema.ts';
import { tileAt } from '@core/stage/loader.ts';

const TILE_COLORS: Readonly<Record<TileKind, number | null>> = {
  empty: null,
  ground: 0x8b5a2b,
  brick: 0xc97a4d,
  goal: 0xfff44f,
};

/** タイル描画結果。destroy で Container と所有テクスチャを解放する。 */
export interface RenderedTilemap {
  container: Container;
  destroy: () => void;
}

export function renderTilemap(app: Application, area: StageArea, tilePx: number): RenderedTilemap {
  const container = new Container();
  const ownedTextures: Texture[] = [];

  // タイル種別ごとにテクスチャを 1 枚だけ生成 (Step B / Gemini Pro 指摘の SpriteAtlas 案を簡易適用)
  const texCache = new Map<TileKind, Texture>();
  function getTex(kind: TileKind): Texture | null {
    const color = TILE_COLORS[kind];
    if (color === null) return null;
    const cached = texCache.get(kind);
    if (cached) return cached;
    const g = new Graphics().rect(0, 0, tilePx, tilePx).fill(color);
    if (kind === 'goal') {
      g.rect(2, 2, tilePx - 4, tilePx - 4).fill(0xffffff);
    }
    const tex = app.renderer.generateTexture(g);
    g.destroy();
    ownedTextures.push(tex);
    texCache.set(kind, tex);
    return tex;
  }

  for (let row = 0; row < area.size.h; row++) {
    for (let col = 0; col < area.size.w; col++) {
      const kind = tileAt(area, col, row);
      const tex = getTex(kind);
      if (!tex) continue;
      const s = new PixiSprite(tex);
      s.x = col * tilePx;
      s.y = row * tilePx;
      container.addChild(s);
    }
  }

  return {
    container,
    destroy: () => {
      container.destroy({ children: true });
      for (const tex of ownedTextures) tex.destroy(true);
      ownedTextures.length = 0;
      texCache.clear();
    },
  };
}
