// Round 7-E / Gemini Pro deep 指摘 5: SIZES / META / ID_ORDER を単一ファイルに集約。
// build-puzzles.mjs / build-index.mjs の双方から import される。

export const SIZES = ['5x5', '10x10', '15x15', '25x25'];
export const SIZE_ORDER = ['5x5', '10x10', '15x15', '25x25'];

// カテゴリ内の表示順 (難易度・好みで人手調整)
export const ID_ORDER = {
  '5x5': ['heart', 'diamond', 'cross'],
  '10x10': ['cat', 'house', 'star', 'mushroom', 'heart-big', 'umbrella', 'rocket', 'tree'],
  '15x15': ['apple', 'rabbit', 'fish', 'giraffe', 'elephant', 'crab', 'snail'],
  '25x25': ['butterfly', 'castle', 'dragon'],
};

// id → メタ (build-puzzles.mjs の image-to-puzzle 起動引数として使用)
export const META = {
  // 5x5
  heart: { title: 'ハート', difficulty: 'easy', description: 'シンプルなハートマーク' },
  diamond: { title: 'ダイヤ', difficulty: 'easy', description: 'ひし形 (ダイヤモンド)' },
  cross: { title: 'プラス', difficulty: 'easy', description: 'プラス記号 (十字)' },

  // 10x10
  cat: { title: 'ねこ', difficulty: 'medium', description: '猫の顔' },
  house: { title: 'いえ', difficulty: 'medium', description: '屋根のある家' },
  star: { title: 'ほし', difficulty: 'medium', description: '5 角星' },
  mushroom: { title: 'きのこ', difficulty: 'medium', description: 'きのこ' },
  'heart-big': { title: 'ハート (大)', difficulty: 'medium', description: '大きなハート' },
  umbrella: { title: 'かさ', difficulty: 'medium', description: '雨傘' },
  rocket: { title: 'ロケット', difficulty: 'medium', description: '上向きロケット' },
  tree: { title: 'き', difficulty: 'medium', description: '針葉樹' },
  // 15x15
  elephant: { title: 'ぞう', difficulty: 'hard', description: 'ぞうの正面' },
  giraffe: { title: 'きりん', difficulty: 'hard', description: '首が長いキリン' },
  rabbit: { title: 'うさぎ', difficulty: 'hard', description: '長い耳のうさぎ' },
  fish: { title: 'さかな', difficulty: 'hard', description: '横向きの魚' },
  crab: { title: 'かに', difficulty: 'hard', description: 'はさみのあるかに' },
  apple: { title: 'りんご', difficulty: 'hard', description: 'りんご' },
  snail: { title: 'かたつむり', difficulty: 'hard', description: 'かたつむり' },
  // 25x25
  dragon: { title: 'ドラゴン', difficulty: 'hard', description: '伝説のドラゴン' },
  castle: { title: 'しろ', difficulty: 'hard', description: '王城のシルエット' },
  butterfly: { title: 'ちょう', difficulty: 'hard', description: '蝶 (左右対称)' },
};

export function durationFor(size) {
  if (size === '5x5') return 60;
  if (size === '10x10') return 600;
  if (size === '15x15') return 1200;
  if (size === '25x25') return 2400;
  return 60;
}
