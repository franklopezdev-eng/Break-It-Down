/**
 * Playback engine. Wraps the visible <video> element and adds what a dance
 * student needs on top of it: section looping with a lead-in, automatic
 * advancement through sections, key-point navigation, frame stepping and speed.
 *
 * UI code reads state through `usePlayer` and drives playback through `player`.
 */

import { create } from 'zustand';
import { resolveInfiniteDuration } from '../media/probe';
import { clamp } from '../analysis/signal';
import {
  MIN_LOOP,
  nextKeyTime,
  previousKeyTime,
  sectionAt,
  shiftRange,
  type Range,
} from '../lib/loop';
import { RATE_MAX, RATE_MIN, RATE_STEP, usePrefs } from './prefs';
import { useSession } from './session';

export interface LoopState extends Range {
  enabled: boolean;
}

interface PlayerState {
  time: number;
  duration: number;
  playing: boolean;
  loop: LoopState;
  /** Passes completed over the current loop range. */
  pass: number;
  /** Seconds per video frame (measured during playback; 1/30 until then). */
  frameDuration: number;
}

const OFF: LoopState = { enabled: false, start: 0, end: 0 };

export const usePlayer = create<PlayerState>(() => ({
  time: 0,
  duration: 0,
  playing: false,
  loop: OFF,
  pass: 0,
  frameDuration: 1 / 30,
}));

const get = usePlayer.getState;
const set = usePlayer.setState;

let video: HTMLVideoElement | null = null;
let detach: (() => void) | null = null;
let raf = 0;
let measuringFrames = false;

const keyTimes = () => useSession.getState().keyPoints.map((k) => k.time);

/** Common frame rates; a measured frame time within 4% of one snaps to it. */
const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
function snapFrameDuration(measured: number): number {
  const fps = 1 / measured;
  const nearest = FRAME_RATES.reduce((best, r) => (Math.abs(r - fps) < Math.abs(best - fps) ? r : best));
  return Math.abs(nearest - fps) / nearest < 0.04 ? 1 / nearest : measured;
}

function measureFrameDuration() {
  const el = video;
  if (measuringFrames || !el || !('requestVideoFrameCallback' in el)) return;
  measuringFrames = true;
  const deltas: number[] = [];
  let last = -1;
  const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
    if (last >= 0) {
      const d = meta.mediaTime - last;
      if (d > 0.004 && d < 0.1) deltas.push(d);
    }
    last = meta.mediaTime;
    if (deltas.length < 16 && el === video && !el.paused) {
      el.requestVideoFrameCallback(onFrame);
      return;
    }
    measuringFrames = false;
    // The smallest gap is the true frame time; larger ones are dropped frames.
    if (deltas.length >= 4) set({ frameDuration: snapFrameDuration(Math.min(...deltas)) });
  };
  el.requestVideoFrameCallback(onFrame);
}

function setPreservesPitch(el: HTMLVideoElement) {
  // Slowing the dance down shouldn't turn the music into a growl.
  const anyEl = el as HTMLVideoElement & { mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean };
  el.preservesPitch = true;
  if ('mozPreservesPitch' in anyEl) anyEl.mozPreservesPitch = true;
  if ('webkitPreservesPitch' in anyEl) anyEl.webkitPreservesPitch = true;
}

function applyPrefs(el: HTMLVideoElement) {
  const { rate, muted } = usePrefs.getState();
  el.defaultPlaybackRate = rate;
  el.playbackRate = rate;
  el.muted = muted;
}

usePrefs.subscribe((state, previous) => {
  if (!video) return;
  if (state.rate !== previous.rate) {
    video.defaultPlaybackRate = state.rate;
    video.playbackRate = state.rate;
  }
  if (state.muted !== previous.muted) video.muted = state.muted;
});

// ── Time & loop enforcement ──────────────────────────────────────────────────

function syncTime() {
  if (!video) return;
  const t = video.currentTime;
  if (Math.abs(t - get().time) > 0.0005) set({ time: t });
}

function seekTo(seconds: number) {
  if (!video) return;
  const duration = get().duration || video.duration || 0;
  const t = clamp(seconds, 0, Math.max(0, duration - 0.001));
  video.currentTime = t;
  set({ time: t });
}

/** Play position for restarting a loop: a little early while playing, exact when paused. */
function loopEntry(start: number): number {
  if (!video || video.paused) return start;
  return Math.max(0, start - usePrefs.getState().leadIn);
}

function wrapLoop() {
  if (!video) return;
  const { loop, pass, duration } = get();
  const { autoAdvance, repeats } = usePrefs.getState();

  let range: Range = { start: loop.start, end: loop.end };
  let nextPass = pass + 1;
  if (autoAdvance && nextPass >= repeats) {
    range = shiftRange(range, keyTimes(), duration, 1);
    nextPass = 0;
  }

  set({ loop: { enabled: true, ...range }, pass: nextPass });
  seekTo(loopEntry(range.start));
  if (video.paused) void video.play().catch(() => undefined); // the 'ended' case
}

function enforceLoop() {
  const { loop, frameDuration } = get();
  if (!video || !loop.enabled || video.paused || video.seeking) return;
  const t = video.currentTime;
  const lead = usePrefs.getState().leadIn;
  // Turn around half a frame early so a frame of the next section never flashes.
  const reachedEnd = t >= loop.end - Math.min(0.05, frameDuration) * 0.5;
  const stranded = t < loop.start - lead - 0.35;
  if (reachedEnd || stranded) wrapLoop();
}

function tick() {
  raf = requestAnimationFrame(tick);
  enforceLoop();
  syncTime();
}

function startTicking() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function stopTicking() {
  cancelAnimationFrame(raf);
}

// ── Element lifecycle ────────────────────────────────────────────────────────

function onMetadata() {
  const el = video;
  if (!el) return;
  applyPrefs(el);
  if (Number.isFinite(el.duration)) {
    set({ duration: el.duration });
  } else {
    // Recorder-made WebM: learn the real length, falling back to what analysis measured.
    set({ duration: useSession.getState().video?.info.duration ?? 0 });
    void resolveInfiniteDuration(el)
      .then(() => {
        if (el === video) set({ duration: el.duration });
      })
      .catch(() => undefined);
  }
}

function attach(el: HTMLVideoElement | null) {
  if (el === video) return;
  detach?.();
  detach = null;
  stopTicking();
  video = el;
  if (!el) {
    set({ playing: false });
    return;
  }

  setPreservesPitch(el);
  applyPrefs(el);

  const listeners: [keyof HTMLMediaElementEventMap, () => void][] = [
    ['loadstart', () => set({ time: 0, playing: false, pass: 0, loop: OFF })],
    ['loadedmetadata', onMetadata],
    ['durationchange', onMetadata],
    [
      'play',
      () => {
        set({ playing: true });
        startTicking();
        measureFrameDuration();
      },
    ],
    [
      'pause',
      () => {
        set({ playing: false });
        stopTicking();
        syncTime();
      },
    ],
    [
      'ended',
      () => {
        if (get().loop.enabled) return wrapLoop();
        set({ playing: false });
        stopTicking();
        syncTime();
      },
    ],
    ['seeked', syncTime],
    [
      'timeupdate',
      () => {
        // Also fires in background tabs, where animation frames don't.
        enforceLoop();
        syncTime();
      },
    ],
  ];
  for (const [type, fn] of listeners) el.addEventListener(type, fn);
  detach = () => {
    for (const [type, fn] of listeners) el.removeEventListener(type, fn);
  };

  if (el.readyState >= 1) onMetadata();
  set({ time: el.currentTime, playing: !el.paused });
  if (!el.paused) startTicking();
}

// ── Public controls ──────────────────────────────────────────────────────────

/** Moves the loop to the section around `t` when looping, so navigation and loop stay in step. */
function followLoop(t: number) {
  const { loop, duration } = get();
  if (!loop.enabled) return;
  set({ loop: { enabled: true, ...sectionAt(keyTimes(), duration, t + 0.001) }, pass: 0 });
}

function jumpTo(seconds: number) {
  seekTo(seconds);
  followLoop(seconds);
}

export const player = {
  attach,

  get element(): HTMLVideoElement | null {
    return video;
  },

  async play() {
    if (!video) return;
    const { loop, time, duration } = get();
    if (loop.enabled && (time >= loop.end - 0.05 || time < loop.start - 0.35)) seekTo(loop.start);
    else if (video.ended || time >= duration - 0.05) seekTo(0);
    try {
      await video.play();
    } catch {
      // Interrupted by a pause() or blocked by autoplay policy; the UI stays in sync via events.
    }
  },

  pause() {
    video?.pause();
  },

  toggle() {
    if (!video) return;
    if (video.paused) void player.play();
    else video.pause();
  },

  seek: seekTo,

  /** Relative seek that also keeps an active loop honest. */
  nudge(seconds: number) {
    jumpTo(get().time + seconds);
  },

  step(direction: 1 | -1) {
    if (!video) return;
    video.pause();
    const fd = get().frameDuration;
    // A time sitting exactly on a frame boundary (as key points often do) belongs to the
    // frame that starts there; the small bias stops floating-point error from disagreeing.
    const index = Math.floor(video.currentTime / fd + 0.01);
    // Aim for the middle of the target frame so rounding can't land on the neighbour.
    seekTo((index + direction) * fd + fd * 0.5);
  },

  nextKeyPoint() {
    const t = nextKeyTime(keyTimes(), get().time);
    if (t !== null) jumpTo(t);
  },

  previousKeyPoint() {
    jumpTo(previousKeyTime(keyTimes(), get().time));
  },

  jumpToKeyPoint(seconds: number) {
    jumpTo(seconds);
  },

  setRate(rate: number) {
    const stepped = Math.round(clamp(rate, RATE_MIN, RATE_MAX) / RATE_STEP) * RATE_STEP;
    usePrefs.getState().set('rate', Number(stepped.toFixed(2)));
  },

  toggleMute() {
    const prefs = usePrefs.getState();
    prefs.set('muted', !prefs.muted);
  },

  toggleLoop() {
    const { loop, time, duration } = get();
    if (loop.enabled) {
      set({ loop: { ...loop, enabled: false }, pass: 0 });
      return;
    }
    // Reuse the previous range if the playhead is still inside it; otherwise loop the current section.
    const reusable = loop.end - loop.start >= MIN_LOOP && time >= loop.start - 0.05 && time <= loop.end + 0.05;
    const range = reusable ? { start: loop.start, end: loop.end } : sectionAt(keyTimes(), duration, time);
    set({ loop: { enabled: true, ...range }, pass: 0 });
  },

  disableLoop() {
    set({ loop: { ...get().loop, enabled: false }, pass: 0 });
  },

  /** Adjusts the loop range (dragging a handle). Keeps looping and resets the pass count. */
  setLoopRange(range: Range) {
    set({ loop: { enabled: true, ...range }, pass: 0 });
  },

  /** Loops exactly `range` and starts playing it. */
  loopRange(range: Range) {
    set({ loop: { enabled: true, ...range }, pass: 0 });
    seekTo(loopEntry(range.start));
    void player.play();
  },
};
