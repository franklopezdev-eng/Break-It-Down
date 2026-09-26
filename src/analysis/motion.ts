/**
 * Turns a sequence of pose landmarks into a single "how much is the dancer moving"
 * curve. Joint speeds are measured in torso-lengths per second, so the result
 * doesn't depend on how close the camera is or how large the video is.
 */

import { fillGaps, gaussianSmooth, movingMedian, percentile } from './signal';
import { POSE_STRIDE, type PoseTrack } from './types';

/** MediaPipe pose landmark indices. */
export const LM = {
  NOSE: 0,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

/** Extremities carry the accents, so they count for more than the core. */
const JOINT_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [LM.NOSE, 0.5],
  [LM.L_SHOULDER, 0.5],
  [LM.R_SHOULDER, 0.5],
  [LM.L_ELBOW, 0.7],
  [LM.R_ELBOW, 0.7],
  [LM.L_WRIST, 1],
  [LM.R_WRIST, 1],
  [LM.L_HIP, 0.5],
  [LM.R_HIP, 0.5],
  [LM.L_KNEE, 0.7],
  [LM.R_KNEE, 0.7],
  [LM.L_ANKLE, 1],
  [LM.R_ANKLE, 1],
];

const MIN_VISIBILITY = 0.4;
/** Pose estimators occasionally flip left/right or jump; cap speeds so a glitch can't dominate. */
const MAX_SPEED = 15;
/** Need at least this much joint weight in a frame for its speed to count. */
const MIN_WEIGHT = 3;

export interface PoseEnergy {
  /** Weighted mean joint speed per sample (torso-lengths/second); NaN where unknown. */
  energy: Float32Array;
  /** Fraction of samples with a usable value. */
  coverage: number;
}

export function poseEnergy(track: PoseTrack): PoseEnergy {
  const n = track.frames.length;
  const { rate, aspect } = track;
  if (n < 3) return { energy: new Float32Array(n).fill(NaN), coverage: 0 };

  const maxGap = Math.max(1, Math.round(0.5 * rate));
  const sigma = Math.min(1.2, Math.max(0.5, 0.06 * rate));

  // Per-joint x/y series in isotropic units (x scaled by the aspect ratio).
  const series = new Map<number, { x: Float32Array; y: Float32Array }>();
  for (const [joint] of JOINT_WEIGHTS) {
    const x = new Float32Array(n).fill(NaN);
    const y = new Float32Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      const frame = track.frames[i];
      if (!frame) continue;
      const base = joint * POSE_STRIDE;
      if (frame[base + 2] < MIN_VISIBILITY) continue;
      x[i] = frame[base] * aspect;
      y[i] = frame[base + 1];
    }
    series.set(joint, {
      x: gaussianSmooth(fillGaps(x, maxGap), sigma),
      y: gaussianSmooth(fillGaps(y, maxGap), sigma),
    });
  }

  // Torso length (mid-shoulder → mid-hip), median-filtered so foreshortening
  // during a turn doesn't swing the scale.
  const ls = series.get(LM.L_SHOULDER)!;
  const rs = series.get(LM.R_SHOULDER)!;
  const lh = series.get(LM.L_HIP)!;
  const rh = series.get(LM.R_HIP)!;
  const torsoRaw = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const sx = (ls.x[i] + rs.x[i]) / 2;
    const sy = (ls.y[i] + rs.y[i]) / 2;
    const hx = (lh.x[i] + rh.x[i]) / 2;
    const hy = (lh.y[i] + rh.y[i]) / 2;
    const len = Math.hypot(sx - hx, sy - hy);
    if (Number.isFinite(len) && len > 1e-3) torsoRaw[i] = len;
  }
  const torso = movingMedian(torsoRaw, Math.max(1, Math.round(rate)));
  const globalTorso = percentile(torsoRaw, 50);
  const fallbackTorso = Number.isFinite(globalTorso) ? globalTorso : 0.25;

  const energy = new Float32Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const scale = Number.isFinite(torso[i]) ? torso[i] : fallbackTorso;
    let sum = 0;
    let weight = 0;
    for (const [joint, w] of JOINT_WEIGHTS) {
      const s = series.get(joint)!;
      const dx = s.x[i] - s.x[i - 1];
      const dy = s.y[i] - s.y[i - 1];
      const speed = (Math.hypot(dx, dy) * rate) / scale;
      if (!Number.isFinite(speed)) continue;
      sum += Math.min(speed, MAX_SPEED) * w;
      weight += w;
    }
    if (weight >= MIN_WEIGHT) energy[i] = sum / weight;
  }
  // The first sample has no predecessor; borrow its neighbour.
  energy[0] = energy[1];

  let usable = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(energy[i])) usable++;
  return { energy, coverage: usable / n };
}
