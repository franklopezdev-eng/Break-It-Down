/** Helpers for drawing tracked poses over the video. */

import { POSE_LANDMARK_COUNT, POSE_STRIDE, type PoseTrack } from './types';

/** Bones to draw between the 33 BlazePose landmarks (face and finger detail omitted). */
const LINKS: readonly (readonly [number, number])[] = [
  [11, 12], [11, 23], [12, 24], [23, 24], // torso
  [11, 13], [13, 15], [12, 14], [14, 16], // arms
  [15, 19], [16, 20], // wrist → index finger
  [23, 25], [25, 27], [24, 26], [26, 28], // legs
  [27, 31], [28, 32], [27, 29], [28, 30], // feet
];

const VISIBLE = 0.5;
const scratch = new Float32Array(POSE_LANDMARK_COUNT * POSE_STRIDE);

/**
 * The pose at `seconds`, blended between the two nearest samples so the skeleton
 * glides at the video's frame rate even though we sampled at 6–15 Hz. Returns null
 * when no dancer was tracked around that time.
 */
export function poseAt(track: PoseTrack, seconds: number): Float32Array | null {
  const { frames, rate } = track;
  if (frames.length === 0) return null;
  const pos = Math.max(0, seconds * rate);
  const i0 = Math.min(frames.length - 1, Math.floor(pos));
  const i1 = Math.min(frames.length - 1, i0 + 1);
  const f = pos - i0;
  const a = frames[i0];
  const b = frames[i1];

  if (a && b && i0 !== i1) {
    for (let i = 0; i < scratch.length; i++) scratch[i] = a[i] + (b[i] - a[i]) * f;
    return scratch;
  }
  return (f < 0.5 ? a ?? b : b ?? a) ?? null;
}

const LEFT = '#64d2ff';
const RIGHT = '#ff6482';
const CENTER = '#ffffff';

function sideColor(a: number, b: number): string {
  if (a % 2 === 1 && b % 2 === 1) return LEFT;
  if (a % 2 === 0 && b % 2 === 0) return RIGHT;
  return CENTER;
}

/** Draws `pose` (normalised landmarks) onto a canvas of `width × height` device pixels. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, pose: Float32Array, width: number, height: number): void {
  const at = (i: number) => ({
    x: pose[i * POSE_STRIDE] * width,
    y: pose[i * POSE_STRIDE + 1] * height,
    v: pose[i * POSE_STRIDE + 2],
  });
  const line = Math.max(2, height * 0.0065);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = line * 2;

  for (const [ia, ib] of LINKS) {
    const a = at(ia);
    const b = at(ib);
    if (a.v < VISIBLE || b.v < VISIBLE) continue;
    ctx.strokeStyle = sideColor(ia, ib);
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Head: a circle sized from the ear-to-ear distance, joined to the shoulders.
  const l = at(7);
  const r = at(8);
  const nose = at(0);
  if (l.v >= VISIBLE && r.v >= VISIBLE) {
    const radius = Math.hypot(l.x - r.x, l.y - r.y) * 0.62;
    ctx.strokeStyle = CENTER;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.arc((l.x + r.x) / 2, (l.y + r.y) / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  const ls = at(11);
  const rs = at(12);
  if (nose.v >= VISIBLE && ls.v >= VISIBLE && rs.v >= VISIBLE) {
    ctx.strokeStyle = CENTER;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y);
    ctx.lineTo((ls.x + rs.x) / 2, (ls.y + rs.y) / 2);
    ctx.stroke();
  }

  // Joints
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const p = at(i);
    if (p.v < VISIBLE) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, line * 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
