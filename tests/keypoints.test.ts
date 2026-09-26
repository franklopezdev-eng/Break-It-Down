import { describe, expect, it } from 'vitest';
import { detectCandidates, selectKeyPoints, snapToNearest } from '../src/analysis/keypoints';
import type { BeatGrid } from '../src/analysis/types';

const RATE = 12;

interface Move {
  /** Start of the swing, seconds. */
  at: number;
  /** How long the limb travels before stopping, seconds. */
  swing: number;
}

/**
 * Synthetic choreography: each move builds up speed over `swing` seconds, then stops
 * dead — the way a dancer hits an accent — and freezes until the next move.
 * Returns the energy curve and the moments where each stop lands.
 */
function choreography(moves: Move[], seconds: number, noise = 0.02) {
  const n = Math.floor(seconds * RATE);
  const energy = new Float32Array(n).fill(0.04);
  let seed = 3;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  };
  for (const m of moves) {
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      if (t >= m.at && t < m.at + m.swing) {
        const p = (t - m.at) / m.swing;
        energy[i] = Math.max(energy[i], 0.15 + 0.85 * Math.sin((Math.PI / 2) * p) ** 1.5);
      }
    }
  }
  for (let i = 0; i < n; i++) energy[i] = Math.min(1, Math.max(0, energy[i] + noise * rand()));
  return { energy, stops: moves.map((m) => m.at + m.swing) };
}

const MOVES: Move[] = [
  { at: 1.0, swing: 0.6 },
  { at: 3.2, swing: 0.5 },
  { at: 5.5, swing: 0.7 },
  { at: 8.0, swing: 0.5 },
  { at: 10.6, swing: 0.6 },
  { at: 13.0, swing: 0.5 },
];

describe('detectCandidates', () => {
  const { energy, stops } = choreography(MOVES, 16);
  const candidates = detectCandidates(energy, RATE);

  it('finds a hit or hold at every stop', () => {
    for (const stop of stops) {
      const near = candidates.filter((c) => (c.kind === 'hit' || c.kind === 'hold') && Math.abs(c.time - stop) < 0.3);
      expect(near.length, `expected a hit/hold near ${stop}s`).toBeGreaterThan(0);
    }
  });

  it('scores real stops well above noise', () => {
    const best = Math.max(...candidates.map((c) => c.score));
    expect(best).toBeGreaterThan(0.6);
  });

  it('reports a hit that runs into a freeze as a single moment', () => {
    const holds = candidates.filter((c) => c.kind === 'hold');
    expect(holds.length).toBeGreaterThan(0);
    for (const hold of holds) {
      const twins = candidates.filter((c) => c.kind === 'hit' && Math.abs(c.time - hold.time) < 0.3);
      expect(twins, `no separate hit beside the hold at ${hold.time.toFixed(2)}s`).toHaveLength(0);
    }
  });

  it('returns candidates in time order with unique ids', () => {
    const times = candidates.map((c) => c.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(candidates.map((c) => c.id)).size).toBe(candidates.length);
  });

  it('finds nothing in a flat signal', () => {
    expect(detectCandidates(new Float32Array(200).fill(0.3), RATE)).toEqual([]);
  });

  it('copes with tiny inputs', () => {
    expect(detectCandidates([], RATE)).toEqual([]);
    expect(detectCandidates([0.1, 0.9, 0.1], RATE)).toEqual([]);
  });
});

describe('detectCandidates — sections', () => {
  it('notices when the movement changes character', () => {
    // 10 s of slow, gentle motion followed by 10 s of frantic motion.
    const n = 20 * RATE;
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      energy[i] = t < 10 ? 0.15 + 0.05 * Math.sin(t * 2) : 0.55 + 0.4 * Math.sin(t * 9) ** 2;
    }
    const sections = detectCandidates(energy, RATE).filter((c) => c.kind === 'section');
    expect(sections.some((c) => Math.abs(c.time - 10) < 1)).toBe(true);
  });
});

describe('selectKeyPoints', () => {
  const { energy, stops } = choreography(MOVES, 16);
  const candidates = detectCandidates(energy, RATE);
  const select = (sensitivity: number, extra: Partial<Parameters<typeof selectKeyPoints>[1]> = {}) =>
    selectKeyPoints(candidates, { duration: 16, sensitivity, beats: null, snapToBeats: false, ...extra });

  it('lands a key point on (almost) every stop at the default sensitivity', () => {
    const points = select(0.5);
    const hit = stops.filter((s) => points.some((p) => Math.abs(p.time - s) < 0.35));
    expect(hit.length).toBeGreaterThanOrEqual(stops.length - 1);
  });

  it('returns more key points as sensitivity rises', () => {
    const counts = [0, 0.25, 0.5, 0.75, 1].map((s) => select(s).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[4]).toBeGreaterThan(counts[0]);
  });

  it('keeps points sorted, inside the video, and at least the minimum gap apart', () => {
    for (const s of [0, 0.5, 1]) {
      const points = select(s);
      for (let i = 1; i < points.length; i++) expect(points[i].time - points[i - 1].time).toBeGreaterThanOrEqual(0.69);
      for (const p of points) {
        expect(p.time).toBeGreaterThan(0.3);
        expect(p.time).toBeLessThan(15.7);
        expect(p.source).toBe('ai');
      }
    }
  });

  it('is deterministic', () => {
    expect(select(0.6)).toEqual(select(0.6));
  });

  it('snaps to a confident beat grid, but not an untrustworthy one', () => {
    const points = select(0.5);
    const first = points[0];
    const grid = (confidence: number): BeatGrid => ({
      bpm: 120,
      confidence,
      // a beat 40 ms away from the first key point
      beats: Array.from({ length: 40 }, (_, i) => first.time + 0.04 + (i - 3) * 0.5),
    });

    const snapped = select(0.5, { beats: grid(0.9), snapToBeats: true })[0];
    expect(snapped.time).toBeCloseTo(first.time + 0.04, 6);

    const untrusted = select(0.5, { beats: grid(0.1), snapToBeats: true })[0];
    expect(untrusted.time).toBe(first.time);

    const disabled = select(0.5, { beats: grid(0.9), snapToBeats: false })[0];
    expect(disabled.time).toBe(first.time);
  });
});

describe('snapToNearest', () => {
  const grid = [1, 2, 3, 4];
  it('snaps within tolerance and leaves distant values alone', () => {
    expect(snapToNearest(2.04, grid, 0.1)).toBe(2);
    expect(snapToNearest(2.5, grid, 0.1)).toBe(2.5);
    expect(snapToNearest(0.95, grid, 0.1)).toBe(1);
    expect(snapToNearest(4.08, grid, 0.1)).toBe(4);
    expect(snapToNearest(7, [], 0.1)).toBe(7);
  });
});
