/**
 * The analysis run: sample the video, measure movement two ways, listen for the
 * beat, and turn it all into a pool of key-point candidates.
 *
 *   frames ─┬─ frame differencing ──────────────┐
 *           └─ MediaPipe pose → joint speeds ───┼─► fused energy ─► candidates
 *   audio  ───── onset envelope → tempo → beats ┘   (beats are used later, for snapping)
 *
 * Pose tracking is optional. If the model can't load (offline, blocked) or nobody
 * is found, frame differencing carries the analysis on its own.
 */

import { fitWithin, type FrameProbe } from '../media/probe';
import { detectCandidates } from './keypoints';
import { poseEnergy } from './motion';
import { createPoseDetector, type PoseDetector } from './pose';
import { analyzeSoundtrack } from './rhythm';
import { clamp, gaussianSmooth, normalize01 } from './signal';
import type { AnalysisResult, BeatGrid, PoseTrack } from './types';

export interface AnalysisStatus {
  audio: 'running' | 'done' | 'skipped';
  /** 0..1 progress through the video's frames. */
  motion: number;
  moments: 'waiting' | 'running' | 'done';
  pose: 'loading' | 'ready' | 'unavailable';
  /** 0..1 while the pose model downloads, otherwise null. */
  modelProgress: number | null;
  /** 0..1 for the overall progress bar. */
  overall: number;
}

export interface PipelineOptions {
  file: Blob;
  probe: FrameProbe;
  signal: AbortSignal;
  onStatus(status: AnalysisStatus): void;
  /** Called after each frame with the frame that was analysed and the pose found in it. */
  onPreview?(canvas: HTMLCanvasElement, landmarks: Float32Array | null): void;
}

/** Cap on frames analysed per video so long clips stay quick. */
const FRAME_BUDGET = 1800;
const MIN_RATE = 6;
const MAX_RATE = 15;
/** Frame-difference pixel changes below this (of 255) are treated as sensor noise. */
const DIFF_NOISE_FLOOR = 6;
/** Give up on pose tracking after this many consecutive inference errors. */
const MAX_POSE_FAILURES = 8;
/** Below this share of frames with a tracked dancer, pose data is too patchy to trust. */
const MIN_POSE_COVERAGE = 0.5;

export function samplingRate(duration: number): number {
  return clamp(FRAME_BUDGET / duration, MIN_RATE, MAX_RATE);
}

/**
 * A frame difference (or a joint speed) measures motion *between* samples i-1 and i,
 * so it describes the instant half a sample before t_i. Averaging each value with its
 * successor re-centres the curve on the sample times, so a stop that lands at t_s
 * shows up at s rather than a sample later.
 */
export function centreOnSamples(x: ArrayLike<number>): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = i + 1 < x.length ? 0.5 * (x[i] + x[i + 1]) : x[i];
  return out;
}

/**
 * Blends pose-based and frame-difference movement into one 0..1 curve, aligned so
 * that `energy[i]` describes time `i / rate`. Pose leads when it covers enough of
 * the video; frame differencing fills any gaps.
 */
export function fuseEnergy(
  diff: Float32Array,
  pose: PoseTrack | null,
): { energy: Float32Array; poseCoverage: number; usedPose: boolean } {
  const motion = normalize01(gaussianSmooth(diff, 1));

  let poseCoverage = 0;
  let usedPose = false;
  let fused = motion;

  if (pose) {
    const { energy: speeds, coverage } = poseEnergy(pose);
    poseCoverage = coverage;
    if (coverage >= MIN_POSE_COVERAGE) {
      const poseNorm = normalize01(speeds);
      fused = new Float32Array(motion.length);
      for (let i = 0; i < fused.length; i++) {
        fused[i] = Number.isFinite(poseNorm[i]) ? 0.7 * poseNorm[i] + 0.3 * motion[i] : motion[i];
      }
      usedPose = true;
    }
  }

  return { energy: normalize01(centreOnSamples(gaussianSmooth(fused, 0.8)), 3, 98), poseCoverage, usedPose };
}

export async function analyzeVideo(options: PipelineOptions): Promise<AnalysisResult> {
  const { file, probe, signal, onStatus, onPreview } = options;
  const { duration, width, height } = probe.info;
  const video = probe.video;
  const aspect = width / height;

  const rate = samplingRate(duration);
  const count = Math.max(4, Math.floor(duration * rate));

  const status: AnalysisStatus = {
    audio: 'running',
    motion: 0,
    moments: 'waiting',
    pose: 'loading',
    modelProgress: null,
    overall: 0,
  };
  const emit = () => {
    const moments = status.moments === 'done' ? 0.07 : status.moments === 'running' ? 0.03 : 0;
    status.overall = clamp(0.02 + 0.9 * status.motion + moments);
    onStatus({ ...status });
  };
  emit();

  // The soundtrack is analysed alongside the frames; it uses the audio decoder and
  // a worker, so the two don't compete much.
  const soundtrack: Promise<BeatGrid | null> = analyzeSoundtrack(file, signal).then((grid) => {
    status.audio = grid ? 'done' : 'skipped';
    emit();
    return grid;
  });
  soundtrack.catch(() => undefined); // an abort while we're mid-loop must not surface as unhandled

  let detector: PoseDetector | null = null;
  try {
    detector = await createPoseDetector((fraction) => {
      status.modelProgress = fraction;
      emit();
    });
    status.pose = 'ready';
  } catch (error) {
    console.warn('Pose tracking unavailable; falling back to motion analysis.', error);
    status.pose = 'unavailable';
  }
  status.modelProgress = null;
  emit();

  try {
    signal.throwIfAborted();

    const poseSize = fitWithin(width, height, 480);
    const poseCanvas = document.createElement('canvas');
    poseCanvas.width = poseSize.width;
    poseCanvas.height = poseSize.height;
    const poseCtx = poseCanvas.getContext('2d', { alpha: false })!;

    const diffW = 64;
    const diffH = Math.max(8, Math.round(diffW / aspect));
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = diffW;
    diffCanvas.height = diffH;
    const diffCtx = diffCanvas.getContext('2d', { willReadFrequently: true })!;

    const diff = new Float32Array(count);
    const frames: (Float32Array | null)[] = [];
    // Two grayscale buffers, swapped each frame so nothing is allocated in the loop.
    let previous: Float32Array | null = null;
    let current: Float32Array = new Float32Array(diffW * diffH);
    let poseFailures = 0;

    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      const time = i / rate;

      await probe.run(async () => {
        await probe.seek(time);
        poseCtx.drawImage(video, 0, 0, poseCanvas.width, poseCanvas.height);
      });

      // Frame differencing on a tiny grayscale copy.
      diffCtx.drawImage(poseCanvas, 0, 0, diffW, diffH);
      const { data } = diffCtx.getImageData(0, 0, diffW, diffH);
      for (let p = 0, q = 0; p < current.length; p++, q += 4) {
        current[p] = 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
      }
      if (previous) {
        let sum = 0;
        for (let p = 0; p < current.length; p++) {
          const d = Math.abs(current[p] - previous[p]);
          if (d > DIFF_NOISE_FLOOR) sum += d;
        }
        diff[i] = sum / current.length / 255;
      } else {
        diff[i] = 0;
      }
      [previous, current] = [current, previous ?? new Float32Array(diffW * diffH)];

      // Pose landmarks.
      let landmarks: Float32Array | null = null;
      if (detector) {
        try {
          landmarks = detector.detect(poseCanvas, time * 1000);
          poseFailures = 0;
        } catch (error) {
          if (++poseFailures >= MAX_POSE_FAILURES) {
            console.warn('Pose tracking stopped after repeated errors.', error);
            detector.close();
            detector = null;
            status.pose = 'unavailable';
          }
        }
      }
      frames.push(landmarks);

      onPreview?.(poseCanvas, landmarks);
      status.motion = (i + 1) / count;
      emit();
    }
    diff[0] = diff[1]; // the first frame has nothing to compare against

    signal.throwIfAborted();
    status.moments = 'running';
    emit();

    const audio = await soundtrack;
    signal.throwIfAborted();

    const track: PoseTrack | null = status.pose === 'unavailable' ? null : { rate, aspect, frames };
    const { energy, poseCoverage, usedPose } = fuseEnergy(diff, track);
    const candidates = detectCandidates(energy, rate);

    status.moments = 'done';
    emit();

    return {
      duration,
      rate,
      energy,
      poseCoverage,
      // Keep landmarks for the skeleton overlay whenever a decent share of frames has them.
      pose: track && poseCoverage >= 0.2 ? track : null,
      audio,
      candidates,
      usedPose,
      poseRan: track !== null,
    };
  } finally {
    detector?.close();
  }
}
