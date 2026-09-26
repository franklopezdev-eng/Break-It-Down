/**
 * Finds the moments in a choreography worth stopping on.
 *
 * Input is a single movement-intensity curve (0..1). Dancers mark choreography
 * with accents, so the detector looks for four things:
 *
 *  - hit      a sharp stop — energy collapses quickly (the "kinematic beat")
 *  - hold     a freeze — the dancer arrests and stays still for a beat or more
 *  - peak     the most explosive part of a big move
 *  - section  the character of the movement changes (novelty on a self-similarity matrix)
 *
 * Every candidate gets a 0..1 score. `selectKeyPoints` then turns the candidate
 * pool into an actual list according to a sensitivity setting, so the slider in the
 * UI can re-pick instantly without re-analysing the video.
 */

import {
  clamp,
  findPeaks,
  gaussianSmooth,
  lerp,
  maxRange,
  meanRange,
} from './signal';
import type { BeatGrid, Candidate, KeyPoint } from './types';

export function detectCandidates(energy: ArrayLike<number>, rate: number): Candidate[] {
  const n = energy.length;
  if (n < 8 || rate <= 0) return [];

  const E = gaussianSmooth(energy, 0.8);
  const hits: Candidate[] = [];
  const holds: Candidate[] = [];
  const others: Candidate[] = [];
  const make = (kind: Candidate['kind'], time: number, score: number): Candidate => ({
    id: `${kind}-${Math.round(time * 1000)}`,
    time,
    score: clamp(score),
    kind,
  });

  // ── Hits: energy falls off a cliff ────────────────────────────────────────
  const lag = Math.max(2, Math.round(0.2 * rate));
  const drop = new Float32Array(n);
  for (let i = lag; i < n; i++) drop[i] = Math.max(0, E[i - lag] - E[i]);

  const hitPeaks = findPeaks(drop, {
    minHeight: 0.18,
    minProminence: 0.12,
    minDistance: Math.max(1, Math.round(0.25 * rate)),
  });
  for (const p of hitPeaks) {
    const i = p.index;
    // The drop is largest a little after the stop began; walk back to the top of
    // the fall and forward to where most of the energy has gone.
    let top = i - lag;
    for (let k = i - lag; k <= i; k++) if (E[k] > E[top]) top = k;
    const cut = E[i] + 0.3 * (E[top] - E[i]);
    let stop = i;
    for (let k = top + 1; k <= i; k++) {
      if (E[k] <= cut) {
        stop = k;
        break;
      }
    }
    hits.push(make('hit', stop / rate, 0.9 * clamp(p.value / 0.7)));
  }

  // ── Holds: a freeze that follows real movement ────────────────────────────
  const lowThreshold = 0.16;
  const holdMin = Math.max(2, Math.round(0.35 * rate));
  const lookback = Math.max(2, Math.round(0.6 * rate));
  for (let i = 0; i < n; ) {
    if (!(E[i] < lowThreshold)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && E[j] < lowThreshold) j++;
    if (j - i >= holdMin && i > 0) {
      const before = maxRange(E, i - lookback, i - 1);
      if (before >= 0.4) holds.push(make('hold', i / rate, 0.55 * before + 0.45 * Math.min(1, (j - i) / rate / 1.2)));
    }
    i = j;
  }

  // A hit that runs straight into a freeze is one moment, not two. Keep the freeze (it
  // says more) but stamp it with the earlier arrest time: the hold's own threshold
  // crossing trails the real stop by a sample or so.
  const merged = new Set<Candidate>();
  for (const hold of holds) {
    const hit = hits.find((h) => !merged.has(h) && h.time >= hold.time - 0.25 && h.time <= hold.time + 0.1);
    if (!hit) continue;
    merged.add(hit);
    hold.time = Math.min(hold.time, hit.time);
    hold.score = Math.max(hold.score, hit.score);
    hold.id = `hold-${Math.round(hold.time * 1000)}`;
  }

  // ── Peaks: the loudest part of a big move ─────────────────────────────────
  const bigMoves = findPeaks(E, {
    minHeight: 0.5,
    minProminence: 0.25,
    minDistance: Math.max(1, Math.round(0.45 * rate)),
  });
  for (const p of bigMoves) others.push(make('peak', p.index / rate, 0.7 * p.value * Math.min(1, 0.5 + p.prominence)));

  // ── Sections: where the movement's character changes ──────────────────────
  for (const s of sectionBoundaries(E, rate)) others.push(make('section', s.time, 0.85 * s.strength));

  return [...hits.filter((h) => !merged.has(h)), ...holds, ...others].sort((a, b) => a.time - b.time);
}

/**
 * Foote-style novelty: describe each half-second window by its energy statistics,
 * compare all windows to each other, and look for checkerboard-shaped changes.
 */
function sectionBoundaries(E: Float32Array, rate: number): { time: number; strength: number }[] {
  const hop = Math.max(1, Math.round(0.5 * rate));
  const win = Math.max(2, Math.round(1.0 * rate));
  const count = Math.floor((E.length - win) / hop) + 1;
  const half = 4; // ±2 s of context on each side of a boundary
  if (count < half * 2 + 2) return [];

  const features: number[][] = [];
  for (let k = 0; k < count; k++) {
    const from = k * hop;
    const mean = meanRange(E, from, from + win);
    let variance = 0;
    for (let i = from; i < from + win; i++) variance += (E[i] - mean) ** 2;
    features.push([mean, Math.sqrt(variance / win), maxRange(E, from, from + win - 1)]);
  }

  // z-score each feature so none dominates the distance
  for (let d = 0; d < 3; d++) {
    const mean = features.reduce((a, f) => a + f[d], 0) / count;
    const sd = Math.sqrt(features.reduce((a, f) => a + (f[d] - mean) ** 2, 0) / count) || 1;
    for (const f of features) f[d] = (f[d] - mean) / sd;
  }
  const similarity = (a: number, b: number) => {
    let dist = 0;
    for (let d = 0; d < 3; d++) dist += (features[a][d] - features[b][d]) ** 2;
    return Math.exp(-dist / 2);
  };
  const block = (r0: number, r1: number, c0: number, c1: number) => {
    let sum = 0;
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) sum += similarity(r, c);
    return sum / ((r1 - r0) * (c1 - c0));
  };

  const novelty = new Float32Array(count);
  for (let k = half; k <= count - half; k++) {
    const within = block(k - half, k, k - half, k) + block(k, k + half, k, k + half);
    const across = 2 * block(k - half, k, k, k + half);
    novelty[k] = Math.max(0, within - across);
  }
  let top = 0;
  for (let k = 0; k < count; k++) top = Math.max(top, novelty[k]);
  if (top < 0.15) return [];

  return findPeaks(novelty, { minHeight: 0.3 * top, minProminence: 0.2 * top, minDistance: half })
    .map((p) => ({ time: (p.index * hop) / rate, strength: clamp(p.value / top) }))
    .filter((s) => s.strength >= 0.35);
}

export interface SelectOptions {
  duration: number;
  /** 0 (only the clearest moments) … 1 (everything plausible). */
  sensitivity: number;
  beats: BeatGrid | null;
  snapToBeats: boolean;
}

/** Beat estimates below this confidence aren't trusted enough to move key points. */
const MIN_SNAP_CONFIDENCE = 0.35;

export function selectKeyPoints(candidates: Candidate[], options: SelectOptions): KeyPoint[] {
  const { duration, beats, snapToBeats } = options;
  const s = clamp(options.sensitivity);

  // Hits in choreography routinely land 1–1.5 s apart, so the default spacing must allow that.
  const minGap = lerp(2.2, 0.5, s);
  const perMinute = lerp(8, 44, s);
  const maxCount = Math.max(2, Math.round((duration / 60) * perMinute));
  const threshold = lerp(0.38, 0.1, s);
  const edge = 0.3;

  const pool = candidates
    .filter((c) => c.score >= threshold && c.time > edge && c.time < duration - edge)
    .sort((a, b) => b.score - a.score || a.time - b.time);

  const kept: Candidate[] = [];
  for (const c of pool) {
    if (kept.length >= maxCount) break;
    if (kept.every((k) => Math.abs(k.time - c.time) >= minGap)) kept.push(c);
  }
  kept.sort((a, b) => a.time - b.time);

  const canSnap = snapToBeats && beats !== null && beats.confidence >= MIN_SNAP_CONFIDENCE && beats.beats.length > 3;
  const tolerance = canSnap ? Math.min(0.1, 0.3 * (60 / beats!.bpm)) : 0;

  const points: KeyPoint[] = [];
  for (const c of kept) {
    const time = canSnap ? snapToNearest(c.time, beats!.beats, tolerance) : c.time;
    const previous = points[points.length - 1];
    // Two moments landing on the same beat are one moment; keep the stronger.
    if (previous && time - previous.time < 0.05) {
      if (c.score > previous.strength) points[points.length - 1] = toKeyPoint(c, time);
      continue;
    }
    points.push(toKeyPoint(c, time));
  }
  return points;
}

function toKeyPoint(c: Candidate, time: number): KeyPoint {
  return { id: c.id, time, strength: c.score, kind: c.kind, source: 'ai' };
}

/** Nearest value in the sorted `grid` to `t`, or `t` itself when nothing is within `tolerance`. */
export function snapToNearest(t: number, grid: readonly number[], tolerance: number): number {
  if (grid.length === 0) return t;
  let lo = 0;
  let hi = grid.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (grid[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  let best = grid[lo];
  if (lo > 0 && Math.abs(grid[lo - 1] - t) < Math.abs(best - t)) best = grid[lo - 1];
  return Math.abs(best - t) <= tolerance ? best : t;
}
