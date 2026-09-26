/// <reference lib="webworker" />
import { analyzeRhythm } from './audio';
import type { BeatGrid } from './types';

export interface RhythmRequest {
  samples: Float32Array;
  sampleRate: number;
}

export type RhythmResponse = { ok: true; grid: BeatGrid | null } | { ok: false; error: string };

self.onmessage = (event: MessageEvent<RhythmRequest>) => {
  try {
    const grid = analyzeRhythm(event.data.samples, event.data.sampleRate);
    self.postMessage({ ok: true, grid } satisfies RhythmResponse);
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) } satisfies RhythmResponse);
  }
};
