// β2.0-β: WebAudio 簡易シンセで効果音を直接生成 (音声ファイル不要、軽量、PWA bundle 軽量化)。
//
// 設計:
// - Browser autoplay policy のため AudioContext は最初のユーザー操作後に初期化 (initAudioOnUserGesture)
// - SE は OscillatorNode + GainNode の short envelope で合成
// - 音量は UserSettings.audio.master * audio.se の積で制御
// - mute / volume は setMuted / setVolume で API 経由のみ変更 (UI 側で UserSettings に同期)
//
// 互換性: AudioContext が無いブラウザ (古い iOS Safari 等) では全 SE が no-op になる。

export type SeName = 'fill' | 'mark' | 'erase' | 'line-complete' | 'clear';

interface SeSpec {
  /** 周波数 (Hz) — 単音 or アルペジオの先頭周波数 */
  freq: number;
  /** 持続時間 (sec) */
  duration: number;
  /** OscillatorType (波形) */
  type: OscillatorType;
  /** ピーク gain (0-1) */
  peakGain: number;
  /** アルペジオ用追加周波数。指定があれば順次再生 */
  arp?: number[];
  /** アルペジオの各音の長さ */
  arpStep?: number;
}

const SE_SPEC: Record<SeName, SeSpec> = {
  // セルを塗る: 短く明るい
  fill: { freq: 880, duration: 0.06, type: 'square', peakGain: 0.18 },
  // ×印: 少し低く / 短く
  mark: { freq: 540, duration: 0.06, type: 'triangle', peakGain: 0.16 },
  // 消去: 短く弱く下降
  erase: { freq: 320, duration: 0.05, type: 'sine', peakGain: 0.14 },
  // 行/列完成: 上昇 2 音
  'line-complete': {
    freq: 660,
    duration: 0.18,
    type: 'sine',
    peakGain: 0.2,
    arp: [880, 1320],
    arpStep: 0.06,
  },
  // クリア: 上昇 4 音 (アルペジオ)
  clear: {
    freq: 523,
    duration: 0.6,
    type: 'sine',
    peakGain: 0.25,
    arp: [659, 783, 1047, 1319],
    arpStep: 0.1,
  },
};

let ctx: AudioContext | null = null;
let masterVolume = 0.7;
let seVolume = 0.7;
let muted = false;

/**
 * AudioContext は最初のユーザー操作 (Tap to Start 等) で初期化する。
 * ブラウザの autoplay policy でユーザー操作前に new AudioContext() しても suspended 状態のまま。
 */
export function initAudioOnUserGesture(): void {
  if (ctx) return;
  if (typeof window === 'undefined') return;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch (e) {
    console.warn('[audio] AudioContext init failed', e);
    ctx = null;
  }
}

export function setVolume(opts: { master?: number; se?: number }): void {
  if (typeof opts.master === 'number') masterVolume = clamp01(opts.master);
  if (typeof opts.se === 'number') seVolume = clamp01(opts.se);
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * SE を再生。AudioContext が無い / mute 中 / 音量 0 の場合は何もしない。
 * 同名 SE が連発されても問題なし (各再生で新しい OscillatorNode を生成)。
 */
export function playSe(name: SeName): void {
  if (muted || !ctx) return;
  const totalGain = masterVolume * seVolume;
  if (totalGain <= 0) return;
  const spec = SE_SPEC[name];
  const now = ctx.currentTime;
  const tones = [spec.freq, ...(spec.arp ?? [])];
  const stepLen = spec.arpStep ?? spec.duration;

  for (let i = 0; i < tones.length; i++) {
    const start = now + i * stepLen;
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(tones[i]!, start);
    const gain = ctx.createGain();
    const peak = spec.peakGain * totalGain;
    // 音量エンベロープ: クリック音回避のため 0 → peak → 0 の短いカーブ
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + stepLen);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + stepLen + 0.02);
    // β2.0-β / Gemini 指摘 3: 一部 iOS Safari でグラフ切断漏れによる回収漏れがあるため明示的に disconnect
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
    };
  }
}

/** test 用: 状態リセット */
export function _resetForTest(): void {
  ctx = null;
  masterVolume = 0.7;
  seVolume = 0.7;
  muted = false;
}

/**
 * β11.0-α: BGM モジュールが AudioContext を共有するための getter。
 * synth.ts と bgm.ts で別 AudioContext を持つと iOS Safari で 2 つ目の生成が失敗するケースあり。
 * 必ず初期化済 (initAudioOnUserGesture 後) のものを返す (未初期化なら null)。
 */
export function getAudioContext(): AudioContext | null {
  return ctx;
}

/** β11.0-α: master 音量を BGM 側で参照するための getter */
export function getMasterVolume(): number {
  return masterVolume;
}
