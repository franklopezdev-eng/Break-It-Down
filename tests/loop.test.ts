import { describe, expect, it } from 'vitest';
import { formatBytes, formatRate, formatTime } from '../src/lib/format';
import {
  boundaries,
  nextKeyTime,
  normalizeRange,
  previousKeyTime,
  sectionAt,
  sectionsOf,
  shiftRange,
} from '../src/lib/loop';

const KEYS = [10, 20, 30];
const DURATION = 40;

describe('sections', () => {
  it('splits the video at every key point', () => {
    expect(sectionsOf(KEYS, DURATION)).toEqual([
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 20, end: 30 },
      { start: 30, end: 40 },
    ]);
  });

  it('is a single section when there are no key points', () => {
    expect(sectionsOf([], DURATION)).toEqual([{ start: 0, end: 40 }]);
  });

  it('ignores key points at the very edges and near-duplicates', () => {
    expect(boundaries([0, 10, 10.01, 39.99], DURATION)).toEqual([0, 10, 40]);
  });

  it('finds the section containing a time, including the boundaries themselves', () => {
    expect(sectionAt(KEYS, DURATION, 15)).toEqual({ start: 10, end: 20 });
    expect(sectionAt(KEYS, DURATION, 20)).toEqual({ start: 20, end: 30 });
    expect(sectionAt(KEYS, DURATION, 0)).toEqual({ start: 0, end: 10 });
    expect(sectionAt(KEYS, DURATION, 40)).toEqual({ start: 30, end: 40 });
  });
});

describe('key point navigation', () => {
  it('next skips the key point you are standing on', () => {
    expect(nextKeyTime(KEYS, 5)).toBe(10);
    expect(nextKeyTime(KEYS, 10)).toBe(20);
    expect(nextKeyTime(KEYS, 30)).toBeNull();
  });

  it('previous restarts the section first, then goes back a section', () => {
    expect(previousKeyTime(KEYS, 25)).toBe(20); // well into the section → restart it
    expect(previousKeyTime(KEYS, 20.3)).toBe(10); // just after the start → go back one
    expect(previousKeyTime(KEYS, 5)).toBe(0);
    expect(previousKeyTime(KEYS, 10.2)).toBe(0);
    expect(previousKeyTime([], 5)).toBe(0);
  });
});

describe('shiftRange', () => {
  it('advances by its own length in sections', () => {
    expect(shiftRange({ start: 10, end: 20 }, KEYS, DURATION, 1)).toEqual({ start: 20, end: 30 });
    expect(shiftRange({ start: 0, end: 20 }, KEYS, DURATION, 1)).toEqual({ start: 20, end: 40 });
  });

  it('wraps past the end back to the start', () => {
    expect(shiftRange({ start: 30, end: 40 }, KEYS, DURATION, 1)).toEqual({ start: 0, end: 10 });
    expect(shiftRange({ start: 20, end: 40 }, KEYS, DURATION, 1)).toEqual({ start: 0, end: 20 });
  });

  it('moves backwards and wraps to the end', () => {
    expect(shiftRange({ start: 20, end: 30 }, KEYS, DURATION, -1)).toEqual({ start: 10, end: 20 });
    expect(shiftRange({ start: 0, end: 10 }, KEYS, DURATION, -1)).toEqual({ start: 30, end: 40 });
  });
});

describe('normalizeRange', () => {
  it('keeps a minimum length and stays inside the video', () => {
    const eps = 1e-9; // 5.3 - 5 isn't exactly 0.3 in floating point
    const r = normalizeRange({ start: 5, end: 5.01 }, DURATION);
    expect(r.end - r.start).toBeGreaterThanOrEqual(0.3 - eps);
    expect(normalizeRange({ start: -3, end: 50 }, DURATION)).toEqual({ start: 0, end: 40 });
    const tail = normalizeRange({ start: 39.99, end: 40 }, DURATION);
    expect(tail.end).toBe(40);
    expect(tail.end - tail.start).toBeGreaterThanOrEqual(0.3 - eps);
  });
});

describe('formatting', () => {
  it('formats times like a media player, truncating', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(75.45, 1)).toBe('1:15.4');
    // within a hair of the next tick counts as that tick (a beat-snapped 7.7999 s reads 7.8)
    expect(formatTime(7.79986, 1)).toBe('0:07.8');
    expect(formatTime(7.75, 1)).toBe('0:07.7');
    expect(formatTime(59.99)).toBe('0:59');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(5.5, 2)).toBe('0:05.50');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-4)).toBe('0:00');
  });

  it('formats speeds without trailing zeros', () => {
    expect(formatRate(1)).toBe('1×');
    expect(formatRate(0.75)).toBe('0.75×');
    expect(formatRate(0.5)).toBe('0.5×');
    expect(formatRate(1.2500001)).toBe('1.25×');
  });

  it('formats file sizes', () => {
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(5.8 * 1024 * 1024)).toBe('5.8 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB');
  });
});
