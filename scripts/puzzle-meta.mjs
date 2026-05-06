// Round 7-E / Gemini Pro deep 指摘 5: SIZES / META / ID_ORDER を単一ファイルに集約。
// build-puzzles.mjs / build-index.mjs の双方から import される。

export const SIZES = ['5x5', '10x10', '15x15', '25x25'];
export const SIZE_ORDER = ['5x5', '10x10', '15x15', '25x25'];

// カテゴリ内の表示順 (難易度・好みで人手調整)
export const ID_ORDER = {
  '5x5': ['heart', 'diamond', 'cross', 'arrow-up', 'smile', 'star-mini', 'triangle-up', 'key', 'bolt', 'letter-x', 'square', 'note', 'sun', 'cloud', 'umbrella-mini', 'fish-mini', 'leaf'],
  '10x10': ['cat', 'house', 'star', 'mushroom', 'heart-big', 'umbrella', 'rocket', 'tree', 'apple-mini', 'car', 'flower', 'cup', 'moon', 'bird', 'clock', 'bread', 'bus', 'pencil', 'fish-10', 'donut'],
  '15x15': ['apple', 'rabbit', 'fish', 'giraffe', 'elephant', 'crab', 'snail', 'train', 'cake', 'penguin', 'boat', 'panda', 'guitar', 'airplane', 'octopus', 'crown', 'flamingo', 'pizza', 'teddy'],
  '25x25': ['butterfly', 'castle', 'dragon', 'lighthouse', 'whale', 'phoenix', 'mountain', 'lion', 'train-big', 'unicorn', 'tree-big'],
};

// id → メタ (build-puzzles.mjs の image-to-puzzle 起動引数として使用)
export const META = {
  // 5x5
  heart: { title: 'ハート', difficulty: 'easy', description: 'シンプルなハートマーク' },
  diamond: { title: 'ダイヤ', difficulty: 'easy', description: 'ひし形 (ダイヤモンド)' },
  cross: { title: 'プラス', difficulty: 'easy', description: 'プラス記号 (十字)' },
  'arrow-up': { title: 'やじるし', difficulty: 'easy', description: '上向きの矢印' },
  smile: { title: 'スマイル', difficulty: 'easy', description: 'にっこり顔' },
  'star-mini': { title: 'ほし', difficulty: 'easy', description: '小さな星' },
  'triangle-up': { title: 'さんかく', difficulty: 'easy', description: '上向きの三角形' },
  key: { title: 'かぎ', difficulty: 'easy', description: '鍵' },
  bolt: { title: 'いなずま', difficulty: 'easy', description: 'いなずまマーク' },
  'letter-x': { title: 'ばつ', difficulty: 'easy', description: 'X 印' },
  square: { title: 'しかく', difficulty: 'easy', description: '四角フレーム' },
  note: { title: 'おんぷ', difficulty: 'easy', description: '音符' },
  sun: { title: 'たいよう', difficulty: 'easy', description: '太陽' },
  cloud: { title: 'くも', difficulty: 'easy', description: '雲' },
  'umbrella-mini': { title: 'かさ (小)', difficulty: 'easy', description: '小さな傘' },
  'fish-mini': { title: 'さかな (小)', difficulty: 'easy', description: '小さな魚' },
  leaf: { title: 'はっぱ', difficulty: 'easy', description: '葉' },

  // 10x10
  cat: { title: 'ねこ', difficulty: 'medium', description: '猫の顔' },
  house: { title: 'いえ', difficulty: 'medium', description: '屋根のある家' },
  star: { title: 'ほし', difficulty: 'medium', description: '5 角星' },
  mushroom: { title: 'きのこ', difficulty: 'medium', description: 'きのこ' },
  'heart-big': { title: 'ハート (大)', difficulty: 'medium', description: '大きなハート' },
  umbrella: { title: 'かさ', difficulty: 'medium', description: '雨傘' },
  rocket: { title: 'ロケット', difficulty: 'medium', description: '上向きロケット' },
  tree: { title: 'き', difficulty: 'medium', description: '針葉樹' },
  'apple-mini': { title: 'りんご (小)', difficulty: 'medium', description: '小さなりんご' },
  car: { title: 'くるま', difficulty: 'medium', description: '横向きの車' },
  flower: { title: 'はな', difficulty: 'medium', description: 'チューリップ' },
  cup: { title: 'カップ', difficulty: 'medium', description: 'マグカップ' },
  moon: { title: 'つき', difficulty: 'medium', description: '三日月' },
  bird: { title: 'とり', difficulty: 'medium', description: '小鳥' },
  clock: { title: 'とけい', difficulty: 'medium', description: '時計' },
  bread: { title: 'パン', difficulty: 'medium', description: '食パン' },
  bus: { title: 'バス', difficulty: 'medium', description: 'バス' },
  pencil: { title: 'えんぴつ', difficulty: 'medium', description: '横向き鉛筆' },
  'fish-10': { title: 'さかな (10)', difficulty: 'medium', description: '10x10 サイズの魚' },
  donut: { title: 'ドーナツ', difficulty: 'medium', description: 'ドーナツ' },
  // 15x15
  elephant: { title: 'ぞう', difficulty: 'hard', description: 'ぞうの正面' },
  giraffe: { title: 'きりん', difficulty: 'hard', description: '首が長いキリン' },
  rabbit: { title: 'うさぎ', difficulty: 'hard', description: '長い耳のうさぎ' },
  fish: { title: 'さかな', difficulty: 'hard', description: '横向きの魚' },
  crab: { title: 'かに', difficulty: 'hard', description: 'はさみのあるかに' },
  apple: { title: 'りんご', difficulty: 'hard', description: 'りんご' },
  snail: { title: 'かたつむり', difficulty: 'hard', description: 'かたつむり' },
  train: { title: 'でんしゃ', difficulty: 'hard', description: '蒸気機関車' },
  cake: { title: 'ケーキ', difficulty: 'hard', description: 'ホールケーキ' },
  penguin: { title: 'ペンギン', difficulty: 'hard', description: 'ペンギン' },
  boat: { title: 'ふね', difficulty: 'hard', description: 'ヨット' },
  panda: { title: 'パンダ', difficulty: 'hard', description: 'パンダの顔' },
  guitar: { title: 'ギター', difficulty: 'hard', description: 'アコースティックギター' },
  airplane: { title: 'ひこうき', difficulty: 'hard', description: '横向きの飛行機' },
  octopus: { title: 'たこ', difficulty: 'hard', description: '8 本足のたこ' },
  crown: { title: 'おうかん', difficulty: 'hard', description: '王冠' },
  flamingo: { title: 'フラミンゴ', difficulty: 'hard', description: 'フラミンゴ' },
  pizza: { title: 'ピザ', difficulty: 'hard', description: 'ホールピザ' },
  teddy: { title: 'テディベア', difficulty: 'hard', description: 'テディベアの顔' },
  // 25x25
  dragon: { title: 'ドラゴン', difficulty: 'hard', description: '伝説のドラゴン' },
  castle: { title: 'しろ', difficulty: 'hard', description: '王城のシルエット' },
  butterfly: { title: 'ちょう', difficulty: 'hard', description: '蝶 (左右対称)' },
  lighthouse: { title: 'とうだい', difficulty: 'hard', description: '灯台' },
  whale: { title: 'くじら', difficulty: 'hard', description: 'クジラ' },
  phoenix: { title: 'ほうおう', difficulty: 'hard', description: '不死鳥' },
  mountain: { title: 'やま', difficulty: 'hard', description: '富士山風の山' },
  lion: { title: 'ライオン', difficulty: 'hard', description: 'たてがみのライオン' },
  'train-big': { title: 'きしゃ', difficulty: 'hard', description: '大型蒸気機関車' },
  unicorn: { title: 'ユニコーン', difficulty: 'hard', description: 'ユニコーン' },
  'tree-big': { title: 'たいじゅ', difficulty: 'hard', description: '大樹' },
};

export function durationFor(size) {
  if (size === '5x5') return 60;
  if (size === '10x10') return 600;
  if (size === '15x15') return 1200;
  if (size === '25x25') return 2400;
  return 60;
}
