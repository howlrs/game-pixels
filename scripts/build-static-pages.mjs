#!/usr/bin/env bun
// β12.0-α SSG パイプ: vite build 後の dist/index.html を template として、各 path 用 HTML を生成。
//
// 出力構成:
//   dist/index.html                                  (top, vite が生成済 → SEO meta 上書き)
//   dist/puzzles/index.html                          (全カテゴリ index)
//   dist/puzzles/<category>/index.html               (カテゴリ index、4 種)
//   dist/puzzles/<category>/<id>/index.html          (個別パズル、21+ 種)
//
// 全 HTML は同じ JS bundle を参照、起動時に window.__PIXELS_INITIAL_PATH__ で初期パスを判別。
//
// セキュリティ (Gemini Pro deep 指摘):
//   - puzzle.id / category は scripts/seo-helpers.mjs の SAFE_*_RE で厳格バリデーション
//   - title / description は HTML エスケープ
//   - JSON-LD 内の </script> は jsonLdSafe で安全化

import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  buildAllPuzzlesSeo,
  buildCategorySeo,
  buildItemListJsonLd,
  buildPuzzleSeo,
  buildSeoHeadBlock,
  buildTopSeo,
  INITIAL_PATH_REPLACE_RE,
  SEO_HEAD_REPLACE_RE,
  SITE_ORIGIN,
} from './seo-helpers.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const TEMPLATE_PATH = join(DIST, 'index.html');
const INDEX_JSON_PATH = join(ROOT, 'public/puzzles/index.json');

if (!existsSync(TEMPLATE_PATH)) {
  console.error(`✗ ${TEMPLATE_PATH} not found. Run 'vite build' first.`);
  process.exit(1);
}

const template = await readFile(TEMPLATE_PATH, 'utf-8');
if (!SEO_HEAD_REPLACE_RE.test(template)) {
  console.error('✗ template に SEO_HEAD_START/END マーカが見つからない (index.html 構造変更?)');
  process.exit(1);
}
if (!INITIAL_PATH_REPLACE_RE.test(template)) {
  console.error('✗ template に window.__PIXELS_INITIAL_PATH__ マーカが見つからない');
  process.exit(1);
}

const index = JSON.parse(await readFile(INDEX_JSON_PATH, 'utf-8'));
const puzzles = index.puzzles;
const categories = index.categoryOrder;

let pageCount = 0;

/** seo オブジェクト → 完全な HTML を template から生成 → 指定パスに書き込み */
async function writePage(path, seo) {
  const headBlock =
    `<!-- @@SEO_HEAD_START@@ -->\n${buildSeoHeadBlock(seo)}\n    <!-- @@SEO_HEAD_END@@ -->`;
  const initial = `window.__PIXELS_INITIAL_PATH__ = "${seo.initialPath}";`;
  const html = template
    .replace(SEO_HEAD_REPLACE_RE, headBlock)
    .replace(INITIAL_PATH_REPLACE_RE, initial);
  // path は "/" or "/puzzles/" or "/puzzles/15x15/rabbit/" 等 (末尾スラッシュ必須)
  if (!path.endsWith('/')) {
    throw new Error(`path must end with '/': ${path}`);
  }
  const outPath = join(DIST, path === '/' ? 'index.html' : `${path.slice(1)}index.html`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html);
  pageCount++;
  console.log(`  ✓ ${path}index.html`);
}

console.log('[1/3] Top page (/)');
await writePage('/', buildTopSeo());

console.log('[2/3] Hub pages');
const allSeo = buildAllPuzzlesSeo(puzzles.length);
allSeo.jsonLd = buildItemListJsonLd(puzzles, '/puzzles/');
await writePage('/puzzles/', allSeo);

for (const cat of categories) {
  const inCat = puzzles.filter((p) => p.category === cat);
  if (inCat.length === 0) continue;
  const seo = buildCategorySeo(cat, inCat.length);
  seo.jsonLd = buildItemListJsonLd(inCat, '/puzzles/');
  await writePage(`/puzzles/${cat}/`, seo);
}

console.log(`[3/3] ${puzzles.length} individual puzzle pages`);
for (const p of puzzles) {
  await writePage(`/puzzles/${p.category}/${p.id}/`, buildPuzzleSeo(p));
}

console.log(`\n✓ Generated ${pageCount} static HTML pages in ${DIST}`);
console.log(`  Top + ${1 + categories.length} hubs + ${puzzles.length} individual = ${pageCount}`);
