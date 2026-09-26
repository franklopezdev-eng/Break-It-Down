import { describe, expect, it } from 'vitest';
import { LM, poseEnergy } from '../src/analysis/motion';
import { POSE_LANDMARK_COUNT, POSE_STRIDE, type PoseTrack } from '../src/analysis/types';

const RATE = 15;
const ASPECT = 16 / 9;

interface Pose {
  scale: number;
  /** Right-wrist offset from its rest position, in torso-lengths. */
  wristDx: number;
  wristDy: number;
}

/** A minimal skeleton: only the joints the motion model reads are visible. */
function frame({ scale, wristDx, wristDy }: Pose): Float32Array {
  const f = new Float32Array(POSE_LANDMARK_COUNT * POSE_STRIDE);
  const set = (joint: number, x: number, y: number) => {
    f[joint * POSE_STRIDE] = (0.5 + x * scale * 0.3) / ASPECT; // x is normalised by frame width
    f[joint * POSE_STRIDE + 1] = 0.5 + y * scale * 0.3;
    f[joint * POSE_STRIDE + 2] = 1;
  };
  // torso is exactly 1 unit long
  set(LM.L_SHOULDER, -0.3, -0.5);
  set(LM.R_SHOULDER, 0.3, -0.5);
  set(LM.L_HIP, -0.2, 0.5);
  set(LM.R_HIP, 0.2, 0.5);
  set(LM.L_WRIST, -0.8, 0.2);
  set(LM.R_WRIST, 0.8 + wristDx, 0.2 + wristDy);
  return f;
}

/** The right wrist circles during [1s, 2s), then holds still. */
function track(scale = 1, seconds = 3.5, dropEvery = 0): PoseTrack {
  const frames: (Float32Array | null)[] = [];
  for (let i = 0; i < seconds * RATE; i++) {
    const t = i / RATE;
    const moving = t >= 1 && t < 2;
    const phase = moving ? (t - 1) * Math.PI * 4 : Math.floor(t) < 1 ? 0 : 4 * Math.PI;
    frames.push(
      dropEvery && i % dropEvery === 0
        ? null
        : frame({ scale, wristDx: 0.5 * Math.cos(phase), wristDy: 0.5 * Math.sin(phase) }),
    );
  }
  return { rate: RATE, aspect: ASPECT, frames };
}

const at = (energy: Float32Array, seconds: number) => energy[Math.round(seconds * RATE)];

describe('poseEnergy', () => {
  it('is high while a limb moves and near zero while the dancer is still', () => {
    const { energy, coverage } = poseEnergy(track());
    expect(coverage).toBe(1);
    expect(at(energy, 1.5)).toBeGreaterThan(0.3);
    expect(at(energy, 0.5)).toBeLessThan(0.02);
    expect(at(energy, 3)).toBeLessThan(0.02);
  });

  it('does not depend on how large the dancer is in frame', () => {
    const small = poseEnergy(track(1)).energy;
    const large = poseEnergy(track(2)).energy;
    expect(at(large, 1.5) / at(small, 1.5)).toBeGreaterThan(0.85);
    expect(at(large, 1.5) / at(small, 1.5)).toBeLessThan(1.15);
  });

  it('bridges short tracking dropouts', () => {
    const { energy, coverage } = poseEnergy(track(1, 3.5, 7));
    expect(coverage).toBeGreaterThan(0.95);
    expect(at(energy, 1.5)).toBeGreaterThan(0.2);
  });

  it('reports no coverage when nobody is tracked', () => {
    const empty: PoseTrack = { rate: RATE, aspect: ASPECT, frames: new Array(60).fill(null) };
    const { coverage } = poseEnergy(empty);
    expect(coverage).toBe(0);
  });
});
