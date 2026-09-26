/**
 * Pure helpers for navigating a video by key points and looping sections.
 * Key points split the video into sections: [0, k1], [k1, k2], … [kn, duration].
 */

export interface Range {
  start: number;
  end: number;
}

/** Shortest loop the UI will allow, seconds. */
export const MIN_LOOP = 0.3;

/** Section boundaries: 0, each key time strictly inside the video, then the duration. */
export function boundaries(keyTimes: readonly number[], duration: number): number[] {
  const inner = keyTimes
    .filter((t) => t > 0.05 && t < duration - 0.05)
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || t - all[i - 1] > 0.05);
  return [0, ...inner, duration];
}

export function sectionsOf(keyTimes: readonly number[], duration: number): Range[] {
  const b = boundaries(keyTimes, duration);
  return b.slice(0, -1).map((start, i) => ({ start, end: b[i + 1] }));
}

/** The section containing time `t`. */
export function sectionAt(keyTimes: readonly number[], duration: number, t: number): Range {
  const sections = sectionsOf(keyTimes, duration);
  for (const s of sections) if (t >= s.start && t < s.end) return s;
  return sections[sections.length - 1];
}

/** First key point after `t`, or null when there isn't one. */
export function nextKeyTime(keyTimes: readonly number[], t: number, epsilon = 0.04): number | null {
  for (const k of [...keyTimes].sort((a, b) => a - b)) if (k > t + epsilon) return k;
  return null;
}

/**
 * Where a "previous" press should land. Like a music player: within `restartAfter`
 * seconds of a key point it goes to the one before, otherwise it restarts the
 * current section. With no earlier key point it returns 0.
 */
export function previousKeyTime(keyTimes: readonly number[], t: number, restartAfter = 0.6): number {
  const sorted = [...keyTimes].sort((a, b) => a - b);
  let i = -1;
  for (let k = 0; k < sorted.length; k++) if (sorted[k] <= t) i = k;
  if (i < 0) return 0;
  if (t - sorted[i] > restartAfter) return sorted[i];
  return i > 0 ? sorted[i - 1] : 0;
}

/**
 * Slides a loop range forward or back by its own length in sections, so a range
 * covering two sections advances two sections at a time. Wraps around the ends.
 */
export function shiftRange(range: Range, keyTimes: readonly number[], duration: number, direction: 1 | -1): Range {
  const b = boundaries(keyTimes, duration);
  const nearest = (t: number) => b.reduce((best, v, i) => (Math.abs(v - t) < Math.abs(b[best] - t) ? i : best), 0);
  const from = nearest(range.start);
  const to = Math.max(from + 1, nearest(range.end));
  const span = to - from;
  const last = b.length - 1;

  let nextFrom = direction === 1 ? to : from - span;
  if (nextFrom >= last) nextFrom = 0;
  if (nextFrom < 0) nextFrom = Math.max(0, last - span);
  const nextTo = Math.min(last, nextFrom + span);
  return { start: b[nextFrom], end: b[nextTo] };
}

/** Clamp a range into the video, keeping at least MIN_LOOP between the ends. */
export function normalizeRange(range: Range, duration: number): Range {
  let start = Math.max(0, Math.min(range.start, duration - MIN_LOOP));
  let end = Math.min(duration, Math.max(range.end, start + MIN_LOOP));
  if (end - start < MIN_LOOP) start = Math.max(0, end - MIN_LOOP);
  return { start, end };
}
