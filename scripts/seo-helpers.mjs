// β12.0-α SSG 共通ヘルパー: HTML エスケープ / JSON-LD 構築 / SEO meta block 生成 / URL routing
//
// Gemini Pro deep 指摘: パズル JSON の id / title にパストラバーサル (../) や XSS タグが
// 含まれないようバリデーションとエスケープを徹底する。

export const SITE_ORIGIN = 'https://pixels.howlrs.net';
export const SITE_NAME = 'ピクセルズ';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;
export const AUTHOR_NAME = '寺島和宏';
export const AUTHOR_ALT = ['terashima kazuhiro', 'howlrs'];
export const AUTHOR_URL = 'https://howlrs.net/';

const SAFE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_CATEGORY_RE = /^[0-9]{1,3}x[0-9]{1,3}$/;

/** id が許容形式 (a-z0-9-, ≤64 chars) か検証。失敗時は throw。 */
export function assertSafeId(id) {
  if (typeof id !== 'string' || !SAFE_ID_RE.test(id)) {
    throw new Error(`Unsafe puzzle id: ${JSON.stringify(id)} (must match ${SAFE_ID_RE})`);
  }
}

/** category が NxM (例: 15x15) 形式か検証。 */
export function assertSafeCategory(cat) {
  if (typeof cat !== 'string' || !SAFE_CATEGORY_RE.test(cat)) {
    throw new Error(`Unsafe category: ${JSON.stringify(cat)} (must match ${SAFE_CATEGORY_RE})`);
  }
}

/** title (任意ユーザー定義文字列) を HTML 属性 / テキストノード両用にエスケープ */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** トップ用 (template の defaultSeo として埋まる) */
export function buildTopSeo() {
  const title = `${SITE_NAME} - Web で遊ぶ無料ノノグラム / ピクチャーロジック | 21 パズル収録`;
  const description =
    '行と列のヒント数字から塗るマスを論理だけで導く Web ノノグラム / ピクチャーロジック。5×5〜25×25 の 21 パズルすべて推測なしで解ける一意解 (CI 強制)。Undo/Redo、ズーム+パン、PWA でオフライン対応。広告・課金・登録ゼロ。';
  return {
    canonical: `${SITE_ORIGIN}/`,
    title,
    description,
    ogTitle: `${SITE_NAME} - Web で遊ぶ無料ノノグラム / ピクチャーロジック`,
    ogDescription:
      '5×5〜25×25 の 21 パズルすべて推測なしで解ける一意解。Undo/Redo、ズーム+パン、PWA でオフライン対応。広告・課金・登録ゼロ。',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: `${SITE_NAME} - Web ノノグラム / ピクチャーロジック (うさぎパズル完成例)`,
    jsonLd: buildVideoGameJsonLd(),
    initialPath: '/',
  };
}

/** カテゴリ index ページ (/puzzles/15x15/ 等) */
export function buildCategorySeo(category, puzzleCount) {
  assertSafeCategory(category);
  const canonical = `${SITE_ORIGIN}/puzzles/${category}/`;
  const title = `${category} ノノグラムパズル一覧 (${puzzleCount} 個) | ${SITE_NAME}`;
  const description = `${SITE_NAME} の ${category} サイズのノノグラム / ピクチャーロジックパズル ${puzzleCount} 個。すべて推測なしで解ける一意解 (CI 強制)。無料・登録不要・PWA でオフライン対応。`;
  return {
    canonical,
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: `${SITE_NAME} - ${category} パズル一覧`,
    jsonLd: null, // ItemList は build-static-pages 側で puzzles 配列から組み立てる
    initialPath: `/puzzles/${category}/`,
  };
}

/** 全カテゴリ index (/puzzles/) */
export function buildAllPuzzlesSeo(totalCount) {
  const canonical = `${SITE_ORIGIN}/puzzles/`;
  const title = `ノノグラムパズル一覧 (全 ${totalCount} 個) | ${SITE_NAME}`;
  const description = `${SITE_NAME} の全 ${totalCount} ノノグラム / ピクチャーロジックパズル一覧。5×5 から 25×25 まで全サイズ網羅。すべて推測なしで解ける一意解 (CI 強制)。無料・登録不要・PWA でオフライン対応。`;
  return {
    canonical,
    title,
    description,
    ogTitle: title,
    ogDescription: description,
    ogImage: DEFAULT_OG_IMAGE,
    ogImageAlt: `${SITE_NAME} - 全パズル一覧`,
    jsonLd: null,
    initialPath: '/puzzles/',
  };
}

/** 個別パズル (/puzzles/<category>/<id>/) */
export function buildPuzzleSeo(puzzle) {
  assertSafeCategory(puzzle.category);
  assertSafeId(puzzle.id);
  const path = `/puzzles/${puzzle.category}/${puzzle.id}/`;
  const canonical = `${SITE_ORIGIN}${path}`;
  const ogImagePath = `/og/${puzzle.category}/${puzzle.id}.png`;
  const ogImage = `${SITE_ORIGIN}${ogImagePath}`;
  const sizeText = `${puzzle.width}×${puzzle.height}`;
  const difficultyText = puzzleDifficultyJa(puzzle.difficulty);
  const desc = puzzle.description ? `${puzzle.description}。` : '';
  const title = `${puzzle.title} (${sizeText}, ${difficultyText}) - ${SITE_NAME} ノノグラム`;
  const description = `${puzzle.title} は ${sizeText} の ${difficultyText} ノノグラム。${desc}行と列のヒント数字から塗るマスを論理だけで導きます。推測なしで解ける一意解。${SITE_NAME} で無料プレイ。`;
  return {
    canonical,
    title,
    description,
    ogTitle: `${puzzle.title} (${sizeText} ノノグラム) | ${SITE_NAME}`,
    ogDescription: `${puzzle.title} の ${sizeText} ノノグラム。${desc}推測なしで解ける一意解、${SITE_NAME} で無料プレイ可能。`,
    ogImage,
    ogImageAlt: `${puzzle.title} (${sizeText} ノノグラム) のプレビュー画像`,
    jsonLd: buildPuzzleJsonLd(puzzle, canonical, ogImage),
    initialPath: path,
  };
}

function puzzleDifficultyJa(d) {
  switch (d) {
    case 'easy':
      return '初級';
    case 'medium':
      return '中級';
    case 'hard':
      return '上級';
    default:
      return '';
  }
}

function buildVideoGameJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: SITE_NAME,
    alternateName: ['Pixels', 'Picross', 'Nonogram'],
    url: `${SITE_ORIGIN}/`,
    description:
      '行と列のヒント数字から塗るマスを論理だけで導く Web ノノグラム / ピクチャーロジック。5×5〜25×25 の 21 パズルすべて推測なしで解ける一意解 (CI 強制)。Undo/Redo、ズーム+パン、PWA でオフライン対応。広告・課金・登録ゼロ。',
    image: DEFAULT_OG_IMAGE,
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    browserRequirements: 'Requires modern browser with WebGPU or WebGL2 support.',
    genre: ['Logic Puzzle', 'Nonogram', 'Picross', 'Picture Logic'],
    inLanguage: 'ja',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
    },
    author: {
      '@type': 'Person',
      name: AUTHOR_NAME,
      alternateName: AUTHOR_ALT,
      url: AUTHOR_URL,
    },
  };
}

function buildPuzzleJsonLd(puzzle, canonical, ogImage) {
  // VideoGame + game の breadcrumb 的 partOf。schema.org/Game は VideoGame の supertype。
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: `${puzzle.title} (${puzzle.width}×${puzzle.height} ノノグラム)`,
    url: canonical,
    image: ogImage,
    description:
      puzzle.description ||
      `${puzzle.title} の ${puzzle.width}×${puzzle.height} ノノグラム / ピクチャーロジック。`,
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    genre: ['Logic Puzzle', 'Nonogram', 'Picross'],
    inLanguage: 'ja',
    isAccessibleForFree: true,
    isPartOf: {
      '@type': 'VideoGame',
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'JPY',
      availability: 'https://schema.org/InStock',
    },
    author: {
      '@type': 'Person',
      name: AUTHOR_NAME,
      url: AUTHOR_URL,
    },
  };
}

export function buildItemListJsonLd(puzzles, urlPrefix) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: puzzles.length,
    itemListElement: puzzles.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_ORIGIN}${urlPrefix}${p.category}/${p.id}/`,
      name: `${p.title} (${p.width}×${p.height} ${puzzleDifficultyJa(p.difficulty)})`,
    })),
  };
}

/**
 * SEO meta block 全体を HTML 文字列で組み立てる。
 * すべてエスケープ済み。template の <!-- @@SEO_HEAD_START@@ --> ... <!-- @@SEO_HEAD_END@@ --> を置換する。
 */
export function buildSeoHeadBlock(seo) {
  const e = escapeHtml;
  const lines = [];
  lines.push(`<title>${e(seo.title)}</title>`);
  lines.push(`<meta name="description" content="${e(seo.description)}" />`);
  lines.push(`<meta name="author" content="howlrs (${AUTHOR_NAME})" />`);
  lines.push(`<link rel="canonical" href="${e(seo.canonical)}" />`);
  lines.push('');
  lines.push('<!-- Open Graph -->');
  lines.push(`<meta property="og:type" content="website" />`);
  lines.push(`<meta property="og:url" content="${e(seo.canonical)}" />`);
  lines.push(`<meta property="og:title" content="${e(seo.ogTitle)}" />`);
  lines.push(`<meta property="og:description" content="${e(seo.ogDescription)}" />`);
  lines.push(`<meta property="og:image" content="${e(seo.ogImage)}" />`);
  lines.push(`<meta property="og:image:width" content="1200" />`);
  lines.push(`<meta property="og:image:height" content="630" />`);
  lines.push(`<meta property="og:image:alt" content="${e(seo.ogImageAlt)}" />`);
  lines.push(`<meta property="og:site_name" content="${e(SITE_NAME)}" />`);
  lines.push(`<meta property="og:locale" content="ja_JP" />`);
  lines.push('');
  lines.push('<!-- Twitter Card -->');
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:url" content="${e(seo.canonical)}" />`);
  lines.push(`<meta name="twitter:title" content="${e(seo.ogTitle)}" />`);
  lines.push(`<meta name="twitter:description" content="${e(seo.ogDescription)}" />`);
  lines.push(`<meta name="twitter:image" content="${e(seo.ogImage)}" />`);
  lines.push(`<meta name="twitter:image:alt" content="${e(seo.ogImageAlt)}" />`);
  if (seo.jsonLd) {
    lines.push('');
    lines.push('<!-- JSON-LD -->');
    lines.push(`<script type="application/ld+json">${jsonLdSafe(seo.jsonLd)}</script>`);
  }
  return lines.map((l) => '    ' + l).join('\n');
}

/**
 * JSON-LD 内に </script> が混入すると HTML パーサーを破壊するので、それを安全にエスケープ。
 * (パズル description にユーザー文字列が入る可能性に備える。)
 */
function jsonLdSafe(obj) {
  return JSON.stringify(obj).replace(/<\/script/gi, '<\\/script');
}

export const SEO_HEAD_REPLACE_RE =
  /<!-- @@SEO_HEAD_START@@ -->[\s\S]*?<!-- @@SEO_HEAD_END@@ -->/;
export const INITIAL_PATH_REPLACE_RE =
  /window\.__PIXELS_INITIAL_PATH__\s*=\s*"[^"]*";/;
