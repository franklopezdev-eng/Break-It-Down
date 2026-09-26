import { describe, expect, it } from 'vitest';
import { detectCandidates, selectKeyPoints } from '../src/analysis/keypoints';
import { centreOnSamples, fuseEnergy, samplingRate } from '../src/analysis/pipeline';

const RATE = 15;

/**
 * What the pipeline actually produces: each value is the motion *between* sample
 * i-1 and i. A dancer swings until `landing` (a time strictly between two samples),
 * then freezes.
 */
function frameDiffs(seconds: number, moves: { from: number; landing: number }[]): Float32Array {
  const n = Math.floor(seconds * RATE);
  const diff = new Float32Array(n).fill(0.004);
  for (const m of moves) {
    for (let i = 1; i < n; i++) {
      const start = (i - 1) / RATE;
      const end = i / RATE;
      // How much of this interval was spent moving
      const moving = Math.max(0, Math.min(end, m.landing) - Math.max(start, m.from));
      diff[i] += (moving * RATE) * 0.05;
    }
  }
  return diff;
}

describe('centreOnSamples', () => {
  it('averages each value with its successor and keeps the length', () => {
    expect([...centreOnSamples([0, 2, 4, 6])]).toEqual([1, 3, 5, 6]);
  });
});

describe('landing-time accuracy', () => {
  // The last frame showing the finished pose is the first sample at or after the landing.
  const landings = [2.2, 4.7, 7.15, 9.6];
  const diff = frameDiffs(12, landings.map((landing) => ({ from: landing - 0.5, landing })));
  const { energy } = fuseEnergy(diff, null);
  const found = detectCandidates(energy, RATE).filter((c) => c.kind === 'hold' || c.kind === 'hit');

  it('places each stop within one sample of the frame that first shows it', () => {
    for (const landing of landings) {
      const firstLandedFrame = Math.ceil(landing * RATE) / RATE;
      const near = found.filter((c) => Math.abs(c.time - firstLandedFrame) < 0.3);
      expect(near.length, `a candidate near ${landing}s`).toBeGreaterThan(0);
      const best = near.reduce((a, b) => (Math.abs(a.time - firstLandedFrame) <= Math.abs(b.time - firstLandedFrame) ? a : b));
      // never early enough to show the move still in flight, never more than ~1.5 samples late
      expect(best.time - firstLandedFrame).toBeGreaterThanOrEqual(-1 / RATE - 1e-9);
      expect(best.time - firstLandedFrame).toBeLessThanOrEqual(1.5 / RATE + 1e-9);
    }
  });

  it('keeps every landing at the default sensitivity when they are 2.4–2.5 s apart', () => {
    const points = selectKeyPoints(detectCandidates(energy, RATE), { duration: 12, sensitivity: 0.5, beats: null, snapToBeats: false });
    for (const landing of landings) {
      expect(points.some((p) => Math.abs(p.time - landing) < 0.35), `key point near ${landing}s`).toBe(true);
    }
  });
});

describe('spacing at the default sensitivity', () => {
  it('keeps hits that land 1.5 s apart instead of letting a weaker moment displace them', () => {
    // Seven stops, 1.5 s apart — as dense as a lot of real choreography.
    const landings = [1.8, 3.3, 4.8, 6.3, 7.8, 9.3, 10.8];
    const diff = frameDiffs(12.75, landings.map((landing) => ({ from: landing - 0.45, landing })));
    const { energy } = fuseEnergy(diff, null);
    const points = selectKeyPoints(detectCandidates(energy, RATE), { duration: 12.75, sensitivity: 0.5, beats: null, snapToBeats: false });
    const covered = landings.filter((l) => points.some((p) => Math.abs(p.time - l) < 0.3));
    expect(covered.length).toBeGreaterThanOrEqual(6);
  });
});

describe('samplingRate', () => {
  it('samples short clips at the maximum rate and long ones more sparsely', () => {
    expect(samplingRate(20)).toBe(15);
    expect(samplingRate(100)).toBe(15);
    expect(samplingRate(240)).toBeCloseTo(7.5);
    expect(samplingRate(3600)).toBe(6);
  });
});
