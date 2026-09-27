import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Layout = 'video' | 'split' | 'overlay';

export interface PrefValues {
  layout: Layout;
  /** Flip the reference video so its left/right match yours. */
  flipVideo: boolean;
  /** Show the camera as a mirror (horizontally flipped). */
  mirrorCamera: boolean;
  /** 'match' crops the camera to the reference video's frame; 'full' shows the whole camera image. */
  mirrorFit: 'match' | 'full';
  showSkeleton: boolean;
  showBeats: boolean;
  snapToBeats: boolean;
  /** Blurred video colours behind the interface. */
  ambient: boolean;
  /** Opacity of the reference video in overlay mode. */
  overlayOpacity: number;
  /** 0 (only the clearest moments) … 1 (everything plausible). */
  sensitivity: number;
  /** Playback speed. */
  rate: number;
  /** Passes over a section before it advances (when auto-advance is on). */
  repeats: number;
  autoAdvance: boolean;
  /** Seconds of run-up before a looped section restarts. */
  leadIn: number;
  muted: boolean;
}

interface Prefs extends PrefValues {
  set<K extends keyof PrefValues>(key: K, value: PrefValues[K]): void;
}

export const RATE_MIN = 0.25;
export const RATE_MAX = 2;
export const RATE_STEP = 0.05;
export const RATE_PRESETS = [0.25, 0.5, 0.75, 1] as const;

export const DEFAULT_PREFS: PrefValues = {
  layout: 'split',
  flipVideo: false,
  mirrorCamera: true,
  mirrorFit: 'match',
  showSkeleton: false,
  showBeats: true,
  snapToBeats: true,
  ambient: true,
  overlayOpacity: 0.55,
  sensitivity: 0.5,
  rate: 1,
  repeats: 4,
  autoAdvance: false,
  leadIn: 0.25,
  muted: false,
};

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      set: (key, value) => set({ [key]: value } as Partial<PrefValues>),
    }),
    {
      name: 'break-it-down:prefs',
      version: 1,
      // Only data goes to storage, never the setter.
      partialize: ({ set: _set, ...values }) => values,
    },
  ),
);
