import { describe, expect, it } from 'vitest';
import { analyzeRhythm, onsetEnvelope } from '../src/analysis/audio';
import { FFT } from '../src/analysis/fft';

const SAMPLE_RATE = 22050;

/** Deterministic noise so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

/** A decaying noise + tone burst — a crude but realistic percussive hit. */
function addHit(out: Float32Array, at: number, amplitude: number, rand: () => number, freq = 900) {
  const start = Math.floor(at * SAMPLE_RATE);
  const length = Math.floor(0.04 * SAMPLE_RATE);
  for (let i = 0; i < length && start + i < out.length; i++) {
    const env = Math.exp(-i / (0.008 * SAMPLE_RATE));
    out[start + i] += amplitude * env * (rand() * 1.5 + Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE));
  }
}

function clickTrack(bpm: number, seconds: number, phase = 0.31) {
  const out = new Float32Array(Math.floor(seconds * SAMPLE_RATE));
  const rand = rng(7);
  const clicks: number[] = [];
  for (let t = phase; t < seconds - 0.1; t += 60 / bpm) {
    clicks.push(t);
    addHit(out, t, 0.7, rand);
  }
  for (let i = 0; i < out.length; i++) out[i] += 0.004 * rand();
  return { samples: out, clicks };
}

/** Kick on 1 & 3, snare on 2 & 4, quieter off-beat hats — a typical dance groove. */
function groove(bpm: number, seconds: number) {
  const out = new Float32Array(Math.floor(seconds * SAMPLE_RATE));
  const rand = rng(11);
  const beat = 60 / bpm;
  const beats: number[] = [];
  for (let n = 0, t = 0.2; t < seconds - 0.2; n++, t += beat) {
    beats.push(t);
    addHit(out, t, n % 2 === 0 ? 0.9 : 0.6, rand, n % 2 === 0 ? 120 : 1800);
    addHit(out, t + beat / 2, 0.25, rand, 6000);
  }
  return { samples: out, beats };
}

function distanceToNearest(t: number, grid: number[]) {
  return Math.min(...grid.map((g) => Math.abs(g - t)));
}

describe('FFT', () => {
  it('puts a pure tone in the right bin', () => {
    const n = 256;
    const fft = new FFT(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 16 * i) / n);
    fft.transform(re, im);
    const mags = Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k], im[k]));
    expect(mags.indexOf(Math.max(...mags))).toBe(16);
    expect(mags[16]).toBeCloseTo(n / 2, 3);
    expect(mags[5]).toBeLessThan(1e-6);
  });

  it('rejects sizes that are not powers of two', () => {
    expect(() => new FFT(100)).toThrow();
  });
});

describe('onsetEnvelope', () => {
  it('spikes at each click and stays quiet between them', () => {
    const { samples, clicks } = clickTrack(120, 6);
    const { env, rate, offset } = onsetEnvelope(samples, SAMPLE_RATE);
    const peakAt = (t: number) => {
      const centre = Math.round((t - offset) * rate);
      let best = 0;
      for (let i = centre - 3; i <= centre + 3; i++) best = Math.max(best, env[i]);
      return best;
    };
    const between = env[Math.round((clicks[2] + 0.25 - offset) * rate)];
    for (const c of clicks.slice(0, 8)) expect(peakAt(c)).toBeGreaterThan(between * 5);
  });
});

describe('analyzeRhythm', () => {
  for (const bpm of [100, 120, 140]) {
    it(`recovers ${bpm} BPM and beat positions from a click track`, () => {
      const { samples, clicks } = clickTrack(bpm, 24);
      const grid = analyzeRhythm(samples, SAMPLE_RATE);
      expect(grid).not.toBeNull();
      expect(Math.abs(grid!.bpm - bpm)).toBeLessThan(2);
      expect(grid!.confidence).toBeGreaterThan(0.5);

      // Nearly every click should have a beat, and every beat should sit on a click.
      expect(grid!.beats.length).toBeGreaterThan(clicks.length * 0.85);
      for (const b of grid!.beats) expect(distanceToNearest(b, clicks)).toBeLessThan(0.04);
    });
  }

  it('finds the beat in a kick/snare/hat groove', () => {
    const { samples, beats } = groove(112, 30);
    const grid = analyzeRhythm(samples, SAMPLE_RATE);
    expect(grid).not.toBeNull();
    expect(Math.abs(grid!.bpm - 112)).toBeLessThan(2.5);
    const onGrid = grid!.beats.filter((b) => distanceToNearest(b, beats) < 0.05).length;
    expect(onGrid / grid!.beats.length).toBeGreaterThan(0.9);
  });

  it('returns null for silence and for clips too short to have a tempo', () => {
    expect(analyzeRhythm(new Float32Array(SAMPLE_RATE * 20), SAMPLE_RATE)).toBeNull();
    expect(analyzeRhythm(clickTrack(120, 2).samples, SAMPLE_RATE)).toBeNull();
  });
});
