/** Small 1-D signal-processing helpers shared by the audio, motion and key-point code. */

export function clamp(x: number, lo = 0, hi = 1): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Percentile (0–100) of the finite values in `values`, using linear interpolation. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const finite: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) finite.push(v);
  }
  if (finite.length === 0) return NaN;
  finite.sort((a, b) => a - b);
  const pos = clamp(p, 0, 100) / 100 * (finite.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return finite[lo] + (finite[hi] - finite[lo]) * (pos - lo);
}

/**
 * Rescales to 0..1 using robust percentiles, so a single outlier frame can't
 * flatten the rest of the signal. NaNs pass through untouched.
 */
export function normalize01(x: ArrayLike<number>, lowPct = 5, highPct = 97): Float32Array {
  const lo = percentile(x, lowPct);
  let hi = percentile(x, highPct);
  const out = new Float32Array(x.length);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return out.fill(NaN);
  if (hi - lo < 1e-9) hi = lo + 1e-9;
  for (let i = 0; i < x.length; i++) out[i] = clamp((x[i] - lo) / (hi - lo));
  return out;
}

/**
 * Gaussian smoothing that ignores NaNs (each output is the weighted mean of the
 * finite neighbours) and clamps at the edges instead of shrinking toward zero.
 */
export function gaussianSmooth(x: ArrayLike<number>, sigma: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  if (sigma <= 0) {
    for (let i = 0; i < n; i++) out[i] = x[i];
    return out;
  }
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float64Array(radius * 2 + 1);
  for (let k = -radius; k <= radius; k++) kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma));

  for (let i = 0; i < n; i++) {
    let sum = 0;
    let weight = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      const v = x[j];
      if (!Number.isFinite(v)) continue;
      const w = kernel[k + radius];
      sum += v * w;
      weight += w;
    }
    out[i] = weight > 0 ? sum / weight : NaN;
  }
  return out;
}

/** Running median over a ±radius window, ignoring NaNs. */
export function movingMedian(x: ArrayLike<number>, radius: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  const window: number[] = [];
  for (let i = 0; i < n; i++) {
    window.length = 0;
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n - 1, i + radius);
    for (let j = lo; j <= hi; j++) if (Number.isFinite(x[j])) window.push(x[j]);
    if (window.length === 0) {
      out[i] = NaN;
      continue;
    }
    window.sort((a, b) => a - b);
    out[i] = window[window.length >> 1];
  }
  return out;
}

/**
 * Linearly interpolates across runs of NaN no longer than `maxGap` samples.
 * Longer runs (and NaNs at the edges) are left untouched.
 */
export function fillGaps(x: ArrayLike<number>, maxGap: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i];
  let i = 0;
  while (i < n) {
    if (Number.isFinite(out[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !Number.isFinite(out[j])) j++;
    const gap = j - i;
    if (i > 0 && j < n && gap <= maxGap) {
      const a = out[i - 1];
      const b = out[j];
      for (let k = 0; k < gap; k++) out[i + k] = a + ((b - a) * (k + 1)) / (gap + 1);
    }
    i = j;
  }
  return out;
}

export interface Peak {
  index: number;
  value: number;
  prominence: number;
}

export interface PeakOptions {
  minProminence?: number;
  minHeight?: number;
  /** Minimum distance between accepted peaks, in samples. */
  minDistance?: number;
}

/**
 * Local-maximum finder with prominence and minimum-distance filtering (the same
 * idea as scipy.signal.find_peaks). Flat tops report their middle sample. Peaks on
 * the first/last sample are ignored.
 */
export function findPeaks(x: ArrayLike<number>, options: PeakOptions = {}): Peak[] {
  const { minProminence = 0, minHeight = -Infinity, minDistance = 1 } = options;
  const n = x.length;
  const found: Peak[] = [];

  for (let i = 1; i < n - 1; i++) {
    if (!(x[i] > x[i - 1])) continue;
    let j = i;
    while (j + 1 < n && x[j + 1] === x[i]) j++;
    if (j + 1 >= n || x[j + 1] > x[i]) {
      i = j;
      continue;
    }
    const mid = (i + j) >> 1;
    const v = x[mid];
    i = j;

    let leftMin = v;
    for (let k = mid - 1; k >= 0 && x[k] <= v; k--) leftMin = Math.min(leftMin, x[k]);
    let rightMin = v;
    for (let k = mid + 1; k < n && x[k] <= v; k++) rightMin = Math.min(rightMin, x[k]);
    const prominence = v - Math.max(leftMin, rightMin);

    if (v >= minHeight && prominence >= minProminence) found.push({ index: mid, value: v, prominence });
  }

  if (minDistance <= 1 || found.length < 2) return found;

  // Greedy: tallest peaks win, anything within minDistance of a winner is dropped.
  const byHeight = [...found].sort((a, b) => b.value - a.value || a.index - b.index);
  const kept: Peak[] = [];
  for (const p of byHeight) {
    if (kept.every((k) => Math.abs(k.index - p.index) >= minDistance)) kept.push(p);
  }
  return kept.sort((a, b) => a.index - b.index);
}

/** Mean of x[from..to) (clamped to bounds); 0 for an empty range. */
export function meanRange(x: ArrayLike<number>, from: number, to: number): number {
  const lo = Math.max(0, Math.floor(from));
  const hi = Math.min(x.length, Math.ceil(to));
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += x[i];
  return sum / (hi - lo);
}

/** Maximum of x[from..to] inclusive (clamped to bounds); -Infinity when empty. */
export function maxRange(x: ArrayLike<number>, from: number, to: number): number {
  const lo = Math.max(0, Math.floor(from));
  const hi = Math.min(x.length - 1, Math.floor(to));
  let m = -Infinity;
  for (let i = lo; i <= hi; i++) if (x[i] > m) m = x[i];
  return m;
}
