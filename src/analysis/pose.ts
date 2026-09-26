/**
 * On-device pose tracking with MediaPipe's PoseLandmarker.
 *
 * The WASM runtime is self-hosted (copied to /mediapipe/wasm by `npm install`).
 * The ~6 MB model is fetched once and cached in the browser's Cache Storage; it's
 * looked up at /models/ first (see `npm run fetch-model` for a fully offline
 * setup) and falls back to Google's public model bucket.
 */

import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { POSE_LANDMARK_COUNT, POSE_STRIDE } from './types';

const BASE = import.meta.env.BASE_URL;
const WASM_DIR = `${BASE}mediapipe/wasm`;
const MODEL_FILE = 'pose_landmarker_lite.task';
const MODEL_URLS = [
  `${BASE}models/${MODEL_FILE}`,
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/${MODEL_FILE}`,
];
const CACHE_NAME = 'break-it-down-models-v1';

/** Timestamps handed to MediaPipe start here, leaving room for the warm-up frame at 0. */
const TIMESTAMP_BASE = 1000;

export interface PoseDetector {
  readonly delegate: 'GPU' | 'CPU';
  /**
   * Finds the dancer in `frame` and returns 33 landmarks as [x, y, visibility]
   * triples (x/y normalised to the frame), or null when nobody is found.
   * `timeMs` is the frame's position in the video and must increase between calls.
   */
  detect(frame: HTMLCanvasElement, timeMs: number): Float32Array | null;
  close(): void;
}

let modelPromise: Promise<Uint8Array> | null = null;

/**
 * A `.task` bundle is a multi-megabyte zip archive, with a couple of padding bytes
 * ahead of the "PK\x03\x04" signature. A dev server's SPA fallback (a few KB of HTML
 * served with status 200 when /models/ is empty) is neither, and must not be mistaken
 * for a model.
 */
export function assertModel(bytes: Uint8Array): Uint8Array {
  const scan = Math.min(bytes.length - 3, 64);
  let zip = false;
  for (let i = 0; i < scan && !zip; i++) {
    zip = bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04;
  }
  if (bytes.length < 100_000 || !zip) throw new Error('Not a MediaPipe model file');
  return bytes;
}

async function download(url: string, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  if (!reader) return assertModel(new Uint8Array(await response.arrayBuffer()));

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress?.(Math.min(1, received / total));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress?.(1);
  return assertModel(bytes);
}

async function loadModel(onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    // Cache Storage is unavailable in some private-browsing modes; carry on without it.
  }

  let lastError: unknown = new Error('No model source available');
  for (const url of MODEL_URLS) {
    try {
      const hit = await cache?.match(url);
      if (hit) return assertModel(new Uint8Array(await hit.arrayBuffer()));
    } catch {
      // fall through to the network
    }
    try {
      const bytes = await download(url, onProgress);
      try {
        await cache?.put(url, new Response(bytes.slice(), { headers: { 'content-type': 'application/octet-stream' } }));
      } catch {
        // caching is best-effort
      }
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** The model buffer is shared between analysis runs; only the landmarker is per-run. */
function getModel(onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  modelPromise ??= loadModel(onProgress).catch((error) => {
    modelPromise = null;
    throw error;
  });
  return modelPromise;
}

export async function createPoseDetector(onModelProgress?: (fraction: number) => void): Promise<PoseDetector> {
  // Loaded on demand so the ~150 KB runtime isn't part of the initial page load.
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const [vision, model] = await Promise.all([FilesetResolver.forVisionTasks(WASM_DIR), getModel(onModelProgress)]);

  const create = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  // Blank frame: proves the delegate can actually run, not just initialise.
  const warmUp = document.createElement('canvas');
  warmUp.width = warmUp.height = 64;

  let delegate: 'GPU' | 'CPU' = 'GPU';
  let landmarker: PoseLandmarker;
  try {
    landmarker = await create('GPU');
    landmarker.detectForVideo(warmUp, 0);
  } catch {
    delegate = 'CPU';
    landmarker = await create('CPU');
    landmarker.detectForVideo(warmUp, 0);
  }

  let lastTimestamp = TIMESTAMP_BASE - 1;
  return {
    delegate,
    detect(frame, timeMs) {
      // MediaPipe throws on repeated or backwards timestamps.
      const timestamp = Math.max(TIMESTAMP_BASE + Math.round(timeMs), lastTimestamp + 1);
      lastTimestamp = timestamp;

      const result = landmarker.detectForVideo(frame, timestamp);
      const points = result.landmarks[0];
      if (!points || points.length < POSE_LANDMARK_COUNT) return null;

      const out = new Float32Array(POSE_LANDMARK_COUNT * POSE_STRIDE);
      for (let i = 0; i < POSE_LANDMARK_COUNT; i++) {
        out[i * POSE_STRIDE] = points[i].x;
        out[i * POSE_STRIDE + 1] = points[i].y;
        out[i * POSE_STRIDE + 2] = points[i].visibility ?? 1;
      }
      return out;
    },
    close() {
      landmarker.close();
    },
  };
}
