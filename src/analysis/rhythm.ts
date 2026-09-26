/**
 * Main-thread side of audio analysis: pull the soundtrack out of the video file,
 * then run the (CPU-heavy) beat tracker in a worker so the UI stays smooth.
 */

import { analyzeRhythm } from './audio';
import type { RhythmRequest, RhythmResponse } from './audio.worker';
import type { BeatGrid } from './types';

const TARGET_RATE = 22_050;
/** Decoding needs the whole file in memory; skip audio for very large videos. */
const MAX_DECODE_BYTES = 300 * 1024 * 1024;

interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
}

/** Decodes the video's audio track to mono. Null when there is none or it can't be decoded. */
export async function decodeAudioMono(file: Blob, signal?: AbortSignal): Promise<DecodedAudio | null> {
  if (file.size > MAX_DECODE_BYTES) return null;

  const Offline: typeof OfflineAudioContext | undefined =
    window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) return null;

  let audio: AudioBuffer;
  try {
    const bytes = await file.arrayBuffer();
    signal?.throwIfAborted();
    // The offline context resamples on decode, so a long stereo track never
    // sits in memory at 44.1/48 kHz.
    audio = await new Offline(1, TARGET_RATE, TARGET_RATE).decodeAudioData(bytes);
  } catch (error) {
    if (signal?.aborted) throw error;
    return null; // no audio track, or a codec the browser can't decode
  }

  const channels = audio.numberOfChannels;
  const samples = new Float32Array(audio.length);
  for (let c = 0; c < channels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < samples.length; i++) samples[i] += data[i] / channels;
  }
  return { samples, sampleRate: audio.sampleRate };
}

function rhythmInWorker(audio: DecodedAudio, signal?: AbortSignal): Promise<BeatGrid | null> {
  return new Promise<BeatGrid | null>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./audio.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(analyzeRhythm(audio.samples, audio.sampleRate)); // workers unavailable: do it inline
      return;
    }

    const finish = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new DOMException('Analysis cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<RhythmResponse>) => {
      finish();
      resolve(event.data.ok ? event.data.grid : null);
    };
    worker.onerror = () => {
      finish();
      resolve(null);
    };
    const request: RhythmRequest = { samples: audio.samples, sampleRate: audio.sampleRate };
    worker.postMessage(request, [audio.samples.buffer]);
  });
}

/** Tempo and beat times for a video file, or null if it has no analysable audio. */
export async function analyzeSoundtrack(file: Blob, signal?: AbortSignal): Promise<BeatGrid | null> {
  const audio = await decodeAudioMono(file, signal);
  if (!audio) return null;
  return rhythmInWorker(audio, signal);
}
