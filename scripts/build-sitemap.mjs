#!/usr/bin/env bun
// β12.0-α: sitemap.xml と robots.txt を build 時生成。
//
// 構成 (Gemini Pro deep 推奨 priority):
//   /                          priority 1.0
//   /puzzles/                  priority 0.8
//   /puzzles/<category>/       priority 0.8 (4 種)
//   /puzzles/<category>/<id>/  priority 0.6 (21+ 種)
//
// lastmod: パズル JSON の git mtime を使う (file ベース最終更新日)
// 全ページ self-referencing canonical なので URL 重複なし

import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SITE_ORIGIN } from './seo-helpers.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const PUZZLES_DIR = join(ROOT, 'public/puzzles');

if (!existsSync(DIST)) {
  console.error(`✗ ${DIST} not found. Run 'vite build' first.`);
  process.exit(1);
}

const index = JSON.parse(await readFile(join(PUZZLES_DIR, 'index.json'), 'utf-8'));
const puzzles = index.puzzles;
const categories = index.categoryOrder;

async function getLastMod(filePath) {
  try {
    const s = await stat(filePath);
    return s.mtime.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const indexMtime = await getLastMod(join(PUZZLES_DIR, 'index.json'));
const today = new Date().toISOString().slice(0, 10);

const urls = [];

// Top
urls.push({ loc: `${SITE_ORIGIN}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' });
// 全カテゴリ index
urls.push({
  loc: `${SITE_ORIGIN}/puzzles/`,
  lastmod: indexMtime,
  changefreq: 'weekly',
  priority: '0.8',
});
// カテゴリ別 index
for (const cat of categories) {
  const inCat = puzzles.filter((p) => p.category === cat);
  if (inCat.length === 0) continue;
  urls.push({
    loc: `${SITE_ORIGIN}/puzzles/${cat}/`,
    lastmod: indexMtime,
    changefreq: 'weekly',
    priority: '0.8',
  });
}
// 個別パズル
for (const p of puzzles) {
  const lastmod = await getLastMod(join(PUZZLES_DIR, p.category, `${p.id}.json`));
  urls.push({
    loc: `${SITE_ORIGIN}/puzzles/${p.category}/${p.id}/`,
    lastmod,
    changefreq: 'monthly',
    priority: '0.6',
  });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

await writeFile(join(DIST, 'sitemap.xml'), xml);
console.log(`✓ dist/sitemap.xml (${urls.length} URLs)`);

const robots = `# https://pixels.howlrs.net/robots.txt
# β12.0-α SSG: 全エンジンに全パスを許可。sitemap で正規 URL を提示。

User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
await writeFile(join(DIST, 'robots.txt'), robots);
console.log('✓ dist/robots.txt');
