import { describe, expect, it } from 'vitest';
import { fillGaps, findPeaks, gaussianSmooth, movingMedian, normalize01, percentile } from '../src/analysis/signal';

describe('percentile', () => {
  it('interpolates and ignores NaN', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([1, NaN, 3], 50)).toBe(2);
    expect(percentile([0, 10], 25)).toBe(2.5);
    expect(percentile([NaN], 50)).toBeNaN();
  });
});

describe('normalize01', () => {
  it('maps the robust range to 0..1 and clips outliers', () => {
    const x = Array.from({ length: 100 }, (_, i) => i);
    x[50] = 10_000; // a single outlier must not flatten everything else
    const out = normalize01(x, 5, 95);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(1);
    expect(out[75]).toBeGreaterThan(0.5);
  });

  it('survives a constant signal', () => {
    const out = normalize01([3, 3, 3, 3]);
    expect([...out].every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});

describe('gaussianSmooth', () => {
  it('preserves a constant signal, including at the edges', () => {
    const out = gaussianSmooth(new Float32Array(20).fill(0.7), 2);
    for (const v of out) expect(v).toBeCloseTo(0.7, 5);
  });

  it('spreads an impulse symmetrically', () => {
    const x = new Float32Array(21);
    x[10] = 1;
    const out = gaussianSmooth(x, 1.5);
    expect(out[10]).toBeGreaterThan(out[8]);
    expect(out[9]).toBeCloseTo(out[11], 6);
  });

  it('ignores NaN neighbours instead of poisoning the output', () => {
    const out = gaussianSmooth([1, 1, NaN, 1, 1], 1);
    expect(out[2]).toBeCloseTo(1, 5);
    expect([...out].every(Number.isFinite)).toBe(true);
  });
});

describe('movingMedian', () => {
  it('removes single-sample spikes', () => {
    const out = movingMedian([1, 1, 9, 1, 1], 1);
    expect([...out]).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('fillGaps', () => {
  it('interpolates short gaps and leaves long ones and edges alone', () => {
    const out = fillGaps([1, NaN, NaN, 4, NaN, NaN, NaN, NaN, 9, NaN], 2);
    expect(out[1]).toBeCloseTo(2);
    expect(out[2]).toBeCloseTo(3);
    expect(Number.isNaN(out[5])).toBe(true); // gap of 4 > maxGap
    expect(Number.isNaN(out[9])).toBe(true); // trailing NaN has nothing to interpolate to
  });
});

describe('findPeaks', () => {
  it('finds local maxima with their prominence', () => {
    const peaks = findPeaks([0, 1, 0, 3, 0, 2, 0]);
    expect(peaks.map((p) => p.index)).toEqual([1, 3, 5]);
    expect(peaks.map((p) => p.prominence)).toEqual([1, 3, 2]);
  });

  it('filters by prominence: a ripple on a slope is not a peak', () => {
    const x = [0, 5, 4.9, 5.0001, 0]; // tiny dip between two near-equal tops
    const strict = findPeaks(x, { minProminence: 1 });
    expect(strict).toHaveLength(1);
  });

  it('enforces minimum distance in favour of the taller peak', () => {
    const peaks = findPeaks([0, 4, 0, 5, 0, 0, 0, 3, 0], { minDistance: 3 });
    expect(peaks.map((p) => p.index)).toEqual([3, 7]);
  });

  it('reports the middle of a flat top and ignores edge samples', () => {
    const peaks = findPeaks([9, 0, 2, 2, 2, 0, 9]);
    expect(peaks.map((p) => p.index)).toEqual([3]);
  });
});
