// β11.0-α: WebAudio 自前合成による BGM (案A: bundle 0 KB / aesthetics 一貫 / PWA オフライン保持)
//
// 設計方針 (Gemini Pro deep 指摘反映):
//   - OfflineAudioContext で 1 ループ分の AudioBuffer を生成
//   - AudioBufferSourceNode.loop = true で再生 (setTimeout スケジュール NG: タブ非アクティブで崩れる)
//   - master → bgm の GainNode 階層 (将来 SE と統合可能)
//   - ローパスフィルター (集中時間延長 / 耳触り改善)
//   - AudioContext は initAudioOnUserGesture (synth.ts) と共有
//
// 楽曲構成 (β11.0-α 第 1 曲):
//   - キー A マイナー (集中向け / 落ち着き)
//   - テンポ ~80 BPM, 8 小節ループ (約 24 秒)
//   - ベース: sine 低音 (A2/E2/F2/G2 の root note 進行)
//   - メロディ: triangle (A4-E5 の上下動)
//   - 音量は SE より控えめ (デフォルト bgmGain = 0.5 * masterGain * 0.4 = 控えめ)

let ctx: AudioContext | null = null;
let bufferCache: AudioBuffer | null = null;
let bufferSampleRate = 0;
let currentSource: AudioBufferSourceNode | null = null;
let bgmGainNode: GainNode | null = null;
let lowpassNode: BiquadFilterNode | null = null;

let bgmEnabled = false;
let bgmVolume = 0.5;
let masterVolume = 0.7;
let muted = false;

const TEMPO_BPM = 80;
const BEATS_PER_BAR = 4;
const TOTAL_BARS = 8;
const BAR_DURATION_SEC = (60 / TEMPO_BPM) * BEATS_PER_BAR;
const LOOP_DURATION_SEC = BAR_DURATION_SEC * TOTAL_BARS; // ~24 sec

// A マイナー pentatonic 風: A C D E G (Pixels の集中向け / メロディが嫌味にならない)
const NOTE_FREQ = {
  A2: 110.0,
  E2: 82.41,
  F2: 87.31,
  G2: 98.0,
  A3: 220.0,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
};

interface BgmNote {
  freq: number;
  startSec: number;
  durationSec: number;
  type: OscillatorType;
  gain: number; // 相対 0..1 (曲内の音量バランス)
}

/**
 * 8 小節の楽曲データを生成。
 * - ベースライン: 各小節の最初に root note (sine, 1 拍長め)
 * - メロディ: pentatonic ベースの上下動 (triangle, 細かいリズム)
 *
 * 進行: Am → Em → Fmaj → G (各 2 小節ずつ ≒ 落ち着き系の 4 コード)
 */
function buildTrack(): BgmNote[] {
  const notes: BgmNote[] = [];
  const beat = 60 / TEMPO_BPM; // 1 拍の秒数

  // ベースライン: 8 小節分 (Am Am Em Em Fmaj Fmaj G G)
  const bassProgression: number[] = [
    NOTE_FREQ.A2, NOTE_FREQ.A2,
    NOTE_FREQ.E2, NOTE_FREQ.E2,
    NOTE_FREQ.F2, NOTE_FREQ.F2,
    NOTE_FREQ.G2, NOTE_FREQ.G2,
  ];
  for (let bar = 0; bar < TOTAL_BARS; bar++) {
    const startSec = bar * BAR_DURATION_SEC;
    notes.push({
      freq: bassProgression[bar]!,
      startSec,
      durationSec: BAR_DURATION_SEC * 0.95,
      type: 'sine',
      gain: 0.45,
    });
    // 5 度上を弱く重ねて広がり (3 拍目)
    notes.push({
      freq: bassProgression[bar]! * 1.5,
      startSec: startSec + beat * 2,
      durationSec: beat * 2 * 0.95,
      type: 'sine',
      gain: 0.18,
    });
  }

  // メロディ: pentatonic (A C D E G) を 8 小節に渡って配置
  // 各小節 4 拍に対し 2-3 音 (休符あり) で疎に配置 → 集中を妨げない
  const melodyPattern: Array<{ freq: number; offsetBeats: number; durBeats: number; gain: number }> = [
    // 小節 1: A4 - C5 (Am 系)
    { freq: NOTE_FREQ.A4, offsetBeats: 0, durBeats: 1.5, gain: 0.32 },
    { freq: NOTE_FREQ.C5, offsetBeats: 2, durBeats: 1.5, gain: 0.28 },
    // 小節 2: D5 - C5
    { freq: NOTE_FREQ.D5, offsetBeats: 0, durBeats: 1.5, gain: 0.30 },
    { freq: NOTE_FREQ.C5, offsetBeats: 2, durBeats: 1.5, gain: 0.26 },
    // 小節 3: E4 - G4 (Em 系)
    { freq: NOTE_FREQ.E4, offsetBeats: 0, durBeats: 1.5, gain: 0.30 },
    { freq: NOTE_FREQ.G4, offsetBeats: 2, durBeats: 1.5, gain: 0.28 },
    // 小節 4: B4 はキー外なので G4 で代用
    { freq: NOTE_FREQ.A4, offsetBeats: 0, durBeats: 1.5, gain: 0.28 },
    { freq: NOTE_FREQ.G4, offsetBeats: 2, durBeats: 1.5, gain: 0.26 },
    // 小節 5: F4 (キー外 → A4 代用) + C5 (Fmaj 系)
    { freq: NOTE_FREQ.A4, offsetBeats: 0, durBeats: 1.5, gain: 0.30 },
    { freq: NOTE_FREQ.C5, offsetBeats: 2, durBeats: 1.5, gain: 0.28 },
    // 小節 6: D5 - C5
    { freq: NOTE_FREQ.D5, offsetBeats: 0, durBeats: 1.5, gain: 0.30 },
    { freq: NOTE_FREQ.C5, offsetBeats: 2, durBeats: 1.5, gain: 0.26 },
    // 小節 7: G4 - D5 (G 系)
    { freq: NOTE_FREQ.G4, offsetBeats: 0, durBeats: 1.5, gain: 0.30 },
    { freq: NOTE_FREQ.D5, offsetBeats: 2, durBeats: 1.5, gain: 0.28 },
    // 小節 8: E5 - C5 → A4 (1 → V → I 解決感)
    { freq: NOTE_FREQ.E5, offsetBeats: 0, durBeats: 1.0, gain: 0.30 },
    { freq: NOTE_FREQ.C5, offsetBeats: 1.5, durBeats: 1.0, gain: 0.26 },
    { freq: NOTE_FREQ.A4, offsetBeats: 3.0, durBeats: 1.0, gain: 0.24 },
  ];

  let bar = 0;
  let count = 0;
  for (const m of melodyPattern) {
    if (count > 0 && count % 2 === 0) bar++;
    if (bar >= TOTAL_BARS) break;
    notes.push({
      freq: m.freq,
      startSec: bar * BAR_DURATION_SEC + m.offsetBeats * beat,
      durationSec: m.durBeats * beat,
      type: 'triangle',
      gain: m.gain,
    });
    count++;
  }

  return notes;
}

/**
 * OfflineAudioContext で 1 ループ分の AudioBuffer を事前合成。
 * Gemini Pro deep 指摘: setTimeout スケジュールはタブ非アクティブで崩れるため AudioBuffer + loop=true が堅牢。
 *
 * Gemini Pro review 指摘 4: 古い iOS Safari は webkitOfflineAudioContext のフォールバックが必要。
 */
async function buildBuffer(targetCtx: AudioContext): Promise<AudioBuffer> {
  const sampleRate = targetCtx.sampleRate;
  const length = Math.ceil(sampleRate * LOOP_DURATION_SEC);
  // OfflineAudioContext で生成 → AudioBuffer 取得 (古い iOS Safari フォールバック対応)
  const OfflineCtor: typeof OfflineAudioContext | undefined =
    typeof OfflineAudioContext !== 'undefined'
      ? OfflineAudioContext
      : (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
          .webkitOfflineAudioContext;
  if (!OfflineCtor) {
    throw new Error('OfflineAudioContext not supported');
  }
  const offline = new OfflineCtor(2, length, sampleRate);
  // ローパスフィルターで耳触り改善 (Gemini 指摘)
  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400; // 高音域カット (集中時間延長)
  lp.Q.value = 0.7;
  lp.connect(offline.destination);

  for (const n of buildTrack()) {
    const osc = offline.createOscillator();
    osc.type = n.type;
    osc.frequency.value = n.freq;
    const g = offline.createGain();
    // 緩やかな envelope (attack 30ms / release 100ms)
    const peak = n.gain;
    const attack = 0.03;
    const release = Math.min(0.1, n.durationSec * 0.3);
    const sustainEnd = n.startSec + n.durationSec - release;
    g.gain.setValueAtTime(0, n.startSec);
    g.gain.linearRampToValueAtTime(peak, n.startSec + attack);
    g.gain.setValueAtTime(peak, sustainEnd);
    g.gain.linearRampToValueAtTime(0, n.startSec + n.durationSec);
    osc.connect(g).connect(lp);
    osc.start(n.startSec);
    osc.stop(n.startSec + n.durationSec + 0.05);
  }

  return offline.startRendering();
}

/** 内部: AudioContext を synth.ts と共有するために setter で受け取る */
export function attachAudioContext(c: AudioContext): void {
  ctx = c;
}

/** master / mute / bgm volume 等の設定 */
export function setBgmEnabled(value: boolean): void {
  bgmEnabled = value;
  if (!value) {
    stopBgm();
  } else {
    void startBgm();
  }
}

export function setBgmVolume(value: number): void {
  bgmVolume = clamp01(value);
  applyGain();
}

export function setBgmMaster(value: number): void {
  masterVolume = clamp01(value);
  applyGain();
}

export function setBgmMuted(value: boolean): void {
  muted = value;
  applyGain();
}

function applyGain(): void {
  if (!bgmGainNode || !ctx) return;
  const target = muted ? 0 : masterVolume * bgmVolume;
  // クリック音回避のための短い ramp
  const now = ctx.currentTime;
  bgmGainNode.gain.cancelScheduledValues(now);
  bgmGainNode.gain.setTargetAtTime(target, now, 0.05);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * BGM 開始: AudioBuffer を生成して loop 再生開始。
 *
 * Gemini Pro 指摘 3: 既に再生中の AudioBufferSourceNode が存在する場合、
 * 必ず stop() + disconnect() を行ってから新しいノードを生成・再生する排他制御が必須。
 * これが漏れるとプレイ再開のたびに BGM が多重再生され、メモリリークと音割れの原因になる。
 */
export async function startBgm(): Promise<void> {
  if (!ctx) return;
  if (!bgmEnabled) return;

  // 既に再生中なら明示的に停止してから再開 (排他制御)
  if (currentSource) {
    stopBgm();
  }

  // sampleRate が変わった場合 (デバイス切替) は再生成
  if (!bufferCache || bufferSampleRate !== ctx.sampleRate) {
    try {
      bufferCache = await buildBuffer(ctx);
      bufferSampleRate = ctx.sampleRate;
    } catch (e) {
      console.warn('[bgm] buildBuffer failed', e);
      return;
    }
  }
  // setBgmEnabled(false) や stopBgm() が awaiting 中に呼ばれたケースを防ぐ
  if (!bgmEnabled || !ctx) return;
  // await の間に既に再生開始されていたら no-op (二重 start 防止)
  if (currentSource) return;

  // GainNode 階層: source → bgmGain → ctx.destination
  if (!bgmGainNode) {
    bgmGainNode = ctx.createGain();
    bgmGainNode.gain.value = muted ? 0 : masterVolume * bgmVolume;
    bgmGainNode.connect(ctx.destination);
  }

  const source = ctx.createBufferSource();
  source.buffer = bufferCache;
  source.loop = true;
  source.loopStart = 0;
  source.loopEnd = LOOP_DURATION_SEC;
  source.connect(bgmGainNode);
  source.start(0);
  currentSource = source;
}

/**
 * BGM 停止 (即座に / フェードアウトなし)。
 * 再開する場合は startBgm() を再度呼ぶ。
 */
export function stopBgm(): void {
  if (!currentSource) return;
  try {
    currentSource.stop();
    currentSource.disconnect();
  } catch {
    /* already stopped */
  }
  currentSource = null;
}

/** test 用: 状態リセット */
export function _resetBgmForTest(): void {
  stopBgm();
  ctx = null;
  bufferCache = null;
  bufferSampleRate = 0;
  if (bgmGainNode) {
    try {
      bgmGainNode.disconnect();
    } catch {
      /* */
    }
    bgmGainNode = null;
  }
  if (lowpassNode) {
    try {
      lowpassNode.disconnect();
    } catch {
      /* */
    }
    lowpassNode = null;
  }
  bgmEnabled = false;
  bgmVolume = 0.5;
  masterVolume = 0.7;
  muted = false;
}

/** 内部状態取得 (テスト・デバッグ用) */
export function _getBgmState(): {
  enabled: boolean;
  volume: number;
  master: number;
  muted: boolean;
  isPlaying: boolean;
} {
  return {
    enabled: bgmEnabled,
    volume: bgmVolume,
    master: masterVolume,
    muted,
    isPlaying: currentSource !== null,
  };
}
