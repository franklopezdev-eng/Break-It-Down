/** What kind of moment a key point marks. */
export type KeyPointKind = 'hit' | 'hold' | 'peak' | 'section' | 'manual';

export interface KeyPoint {
  id: string;
  /** Position in the video, seconds. */
  time: number;
  /** 0..1 — how confident / prominent the moment is. */
  strength: number;
  kind: KeyPointKind;
  source: 'ai' | 'manual';
}

/** A potential key point produced by the detector, before sensitivity is applied. */
export interface Candidate {
  /** Stable across sensitivity changes, so dismissals survive re-selection. */
  id: string;
  time: number;
  /** 0..1, comparable across kinds. */
  score: number;
  kind: Exclude<KeyPointKind, 'manual'>;
}

/**
 * Pose landmarks sampled from the video at a fixed rate.
 * Each frame holds 33 landmarks as [x, y, visibility] triples (x/y normalised to
 * the video frame), or `null` when no person was found in that frame.
 */
export interface PoseTrack {
  /** Samples per second. */
  rate: number;
  /** Video width / height — needed to make x and y comparable. */
  aspect: number;
  frames: (Float32Array | null)[];
}

export interface BeatGrid {
  bpm: number;
  /** 0..1 — how trustworthy the tempo/beat estimate is. */
  confidence: number;
  /** Beat positions in seconds. */
  beats: number[];
}

export interface AnalysisResult {
  duration: number;
  /** Sample rate of `energy` (samples per second of video). */
  rate: number;
  /** Fused movement intensity, 0..1. */
  energy: Float32Array;
  /** Share of sampled frames in which a dancer was tracked, 0..1. */
  poseCoverage: number;
  /** Raw landmarks, kept so the skeleton can be drawn over the video. */
  pose: PoseTrack | null;
  /** Detected tempo and beats, or null when the video has no usable audio. */
  audio: BeatGrid | null;
  candidates: Candidate[];
  /** Whether pose tracking contributed to `energy` (vs. frame differencing alone). */
  usedPose: boolean;
  /** Whether the pose model ran at all. False means it couldn't be loaded (e.g. offline). */
  poseRan: boolean;
}

export type AnalysisStage = 'audio' | 'motion' | 'moments';

export const POSE_LANDMARK_COUNT = 33;
export const POSE_STRIDE = 3;
