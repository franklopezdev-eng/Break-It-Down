/**
 * Music analysis: onset envelope → tempo → beat grid.
 *
 * This is a compact take on the classic Ellis (2007) pipeline: a log-mel spectral
 * flux envelope, tempo from a prior-weighted autocorrelation, then a dynamic
 * programming pass that picks the beat sequence balancing onset strength against
 * tempo consistency. It's pure functions on Float32Arrays so it runs in a worker
 * and is easy to test with synthetic click tracks.
 */

import { FFT } from './fft';
import { clamp, gaussianSmooth } from './signal';
import type { BeatGrid } from './types';

const FRAME = 1024;
const HOP = 256;
const MEL_BANDS = 32;

export interface OnsetEnvelope {
  env: Float32Array;
  /** Envelope samples per second. */
  rate: number;
  /**
   * Seconds to add to `index / rate` to get the time of the audio event that
   * produced that envelope sample. Log-compressed flux fires as soon as an attack
   * enters the tail of the analysis window, so the event sits ~0.65 of a frame
   * after the frame's start (measured against synthetic click tracks).
   */
  offset: number;
}

interface MelBand {
  start: number;
  weights: Float64Array;
}

const melScale = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number) => 700 * (10 ** (mel / 2595) - 1);

function buildMelBands(sampleRate: number): MelBand[] {
  const bins = FRAME / 2 + 1;
  const fMin = 40;
  const fMax = Math.min(8000, sampleRate / 2 - 100);
  const mMin = melScale(fMin);
  const mMax = melScale(fMax);
  const edges = Array.from({ length: MEL_BANDS + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (MEL_BANDS + 1)));
  const binHz = sampleRate / FRAME;

  const bands: MelBand[] = [];
  for (let b = 0; b < MEL_BANDS; b++) {
    const lo = edges[b];
    const mid = edges[b + 1];
    const hi = edges[b + 2];
    const first = Math.max(0, Math.floor(lo / binHz));
    const last = Math.min(bins - 1, Math.ceil(hi / binHz));
    const weights = new Float64Array(Math.max(1, last - first + 1));
    for (let k = first; k <= last; k++) {
      const f = k * binHz;
      const w = f < mid ? (f - lo) / (mid - lo) : (hi - f) / (hi - mid);
      weights[k - first] = Math.max(0, w);
    }
    bands.push({ start: first, weights });
  }
  return bands;
}

/** Log-mel spectral flux: how much new energy appears in each frame. */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): OnsetEnvelope {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const env = new Float32Array(frames);
  const rate = sampleRate / HOP;
  const offset = (FRAME * 0.65) / sampleRate;
  if (frames < 2) return { env, rate, offset };

  const fft = new FFT(FRAME);
  const bands = buildMelBands(sampleRate);
  const hann = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));

  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  // A full-scale sine has |X| ≈ FRAME/4 after Hann windowing.
  const norm = 1 / ((FRAME / 4) * (FRAME / 4));
  let prev = new Float64Array(MEL_BANDS);
  let cur = new Float64Array(MEL_BANDS);

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[off + i] * hann[i];
      im[i] = 0;
    }
    fft.transform(re, im);

    let flux = 0;
    for (let b = 0; b < MEL_BANDS; b++) {
      const { start, weights } = bands[b];
      let energy = 0;
      for (let k = 0; k < weights.length; k++) {
        const bin = start + k;
        energy += weights[k] * (re[bin] * re[bin] + im[bin] * im[bin]);
      }
      cur[b] = Math.log1p(1e4 * energy * norm);
      if (f > 0) flux += Math.max(0, cur[b] - prev[b]);
    }
    env[f] = flux / MEL_BANDS;
    [prev, cur] = [cur, prev];
  }

  return { env: gaussianSmooth(env, 1), rate, offset };
}

export interface TempoEstimate {
  bpm: number;
  /** 0..1 */
  confidence: number;
}

export interface TempoOptions {
  minBpm?: number;
  maxBpm?: number;
  /** Centre of the log-normal tempo prior (people tap around 120). */
  priorBpm?: number;
  /** Width of the prior, in octaves. */
  priorOctaves?: number;
}

/** Tempo from the autocorrelation of the onset envelope, weighted by a tempo prior. */
export function estimateTempo(env: Float32Array, rate: number, options: TempoOptions = {}): TempoEstimate | null {
  const { minBpm = 70, maxBpm = 180, priorBpm = 120, priorOctaves = 1.2 } = options;
  const n = env.length;
  if (n < rate * 5) return null;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const x = new Float64Array(n);
  let variance = 0;
  for (let i = 0; i < n; i++) {
    x[i] = env[i] - mean;
    variance += x[i] * x[i];
  }
  if (variance < 1e-12) return null;

  const lagMin = Math.max(2, Math.floor((rate * 60) / maxBpm));
  const lagMax = Math.ceil((rate * 60) / minBpm);
  const maxLag = Math.min(n - 1, lagMax * 4 + 2);

  const ac = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
    ac[lag] = sum / (n - lag);
  }

  // Reinforce each candidate with its 2× and 4× multiples so a beat-level pulse
  // beats the bar-level one, then weight by the tempo prior.
  const scoreAt = (lag: number) => {
    const bpm = (rate * 60) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / priorBpm) / priorOctaves) ** 2);
    const harmonic = ac[lag] + 0.5 * (ac[lag * 2] ?? 0) + 0.25 * (ac[lag * 4] ?? 0);
    return Math.max(0, harmonic) * prior;
  };

  let bestLag = -1;
  let best = -Infinity;
  let total = 0;
  let count = 0;
  for (let lag = lagMin; lag <= Math.min(lagMax, maxLag); lag++) {
    const s = scoreAt(lag);
    total += s;
    count++;
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || best <= 0) return null;

  // Parabolic refinement for sub-frame lag precision.
  let refined = bestLag;
  if (bestLag > lagMin && bestLag < Math.min(lagMax, maxLag)) {
    const a = scoreAt(bestLag - 1);
    const b = scoreAt(bestLag);
    const c = scoreAt(bestLag + 1);
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-12) refined = bestLag + clamp((0.5 * (a - c)) / denom, -0.5, 0.5);
  }

  const ratio = best / Math.max(1e-12, total / count);
  return { bpm: (rate * 60) / refined, confidence: clamp((ratio - 1.5) / 4) };
}

/**
 * Dynamic-programming beat tracker. Returns beat positions as envelope frame
 * indices; each is reachable from the previous by roughly one beat period.
 */
export function trackBeatFrames(env: Float32Array, rate: number, bpm: number, tightness = 100): number[] {
  const n = env.length;
  if (n === 0) return [];
  const period = (rate * 60) / bpm;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (env[i] - mean) ** 2;
  const std = Math.sqrt(variance / n) || 1;
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) local[i] = env[i] / std;

  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const minSpan = Math.max(1, Math.round(period / 2));
  const maxSpan = Math.max(minSpan + 1, Math.round(period * 2));

  for (let t = 0; t < n; t++) {
    let best = -Infinity;
    let from = -1;
    for (let d = minSpan; d <= maxSpan; d++) {
      const j = t - d;
      if (j < 0) break;
      const s = cum[j] - tightness * Math.log(d / period) ** 2;
      if (s > best) {
        best = s;
        from = j;
      }
    }
    if (from >= 0 && best > 0) {
      cum[t] = local[t] + best;
      back[t] = from;
    } else {
      cum[t] = local[t];
    }
  }

  // Start from the last strong local maximum of the cumulative score.
  const maxima: number[] = [];
  for (let t = 1; t < n - 1; t++) if (cum[t] > cum[t - 1] && cum[t] >= cum[t + 1]) maxima.push(t);
  if (maxima.length === 0) return [];
  const sorted = maxima.map((t) => cum[t]).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  let tail = maxima[0];
  for (const t of maxima) if (cum[t] * 2 > median) tail = t;

  const beats: number[] = [];
  for (let t = tail; t >= 0; t = back[t]) {
    beats.push(t);
    if (back[t] < 0) break;
  }
  beats.reverse();

  return trimWeakBeats(beats, local);
}

/** Drops leading/trailing beats that sit on almost no onset energy. */
function trimWeakBeats(beats: number[], onset: Float64Array): number[] {
  if (beats.length < 3) return beats;
  const strength = beats.map((b) => {
    let s = 0;
    let w = 0;
    for (let k = -2; k <= 2; k++) {
      const i = b + k;
      if (i < 0 || i >= onset.length) continue;
      const weight = 3 - Math.abs(k);
      s += onset[i] * weight;
      w += weight;
    }
    return s / w;
  });
  const rms = Math.sqrt(strength.reduce((a, v) => a + v * v, 0) / strength.length);
  const floor = 0.5 * rms;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi && strength[lo] < floor) lo++;
  while (hi > lo && strength[hi] < floor) hi--;
  return beats.slice(lo, hi + 1);
}

/** Full audio pass: envelope, tempo and beat times. Null when there's no usable rhythm. */
export function analyzeRhythm(samples: Float32Array, sampleRate: number): BeatGrid | null {
  const { env, rate, offset } = onsetEnvelope(samples, sampleRate);
  const tempo = estimateTempo(env, rate);
  if (!tempo) return null;

  const frames = trackBeatFrames(env, rate, tempo.bpm);
  if (frames.length < 4) return null;

  let atBeats = 0;
  let overall = 0;
  for (const f of frames) atBeats += env[f];
  for (let i = 0; i < env.length; i++) overall += env[i];
  atBeats /= frames.length;
  overall /= env.length;
  const contrast = overall > 1e-9 ? atBeats / overall : 1;

  return {
    bpm: tempo.bpm,
    confidence: clamp(0.5 * tempo.confidence + 0.5 * clamp((contrast - 1) / 2)),
    beats: frames.map((f) => f / rate + offset),
  };
}
