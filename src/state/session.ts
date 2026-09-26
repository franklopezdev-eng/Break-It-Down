/**
 * Everything about the currently loaded video: the file, its analysis, and the key
 * points derived from it. Actions are plain functions (not store methods) so they
 * can be called from anywhere, including outside React.
 */

import { create } from 'zustand';
import { selectKeyPoints } from '../analysis/keypoints';
import { analyzeVideo, type AnalysisStatus } from '../analysis/pipeline';
import type { AnalysisResult, KeyPoint } from '../analysis/types';
import { FrameProbe, VideoLoadError, type VideoInfo } from '../media/probe';
import { ThumbnailService } from '../media/thumbnails';
import { usePrefs } from './prefs';
import { toast } from './toast';
import { setMirrorOnly } from './ui';

export interface LoadedVideo {
  id: string;
  file: File;
  url: string;
  name: string;
  info: VideoInfo;
  probe: FrameProbe;
  thumbs: ThumbnailService;
}

export type AnalysisPhase = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

interface SessionState {
  video: LoadedVideo | null;
  /** True while a picked file's metadata is being read. */
  opening: boolean;
  phase: AnalysisPhase;
  status: AnalysisStatus | null;
  error: string | null;
  /** The frame being analysed, for the live preview. */
  previewCanvas: HTMLCanvasElement | null;
  previewLandmarks: Float32Array | null;
  result: AnalysisResult | null;
  /** Key points the user added by hand. */
  manual: KeyPoint[];
  /** AI candidates the user removed. */
  dismissed: ReadonlySet<string>;
  /** The merged, sorted list everything else reads. */
  keyPoints: KeyPoint[];
}

const EMPTY_ANALYSIS = {
  phase: 'idle' as AnalysisPhase,
  status: null,
  error: null,
  previewCanvas: null,
  previewLandmarks: null,
  result: null,
  manual: [] as KeyPoint[],
  dismissed: new Set<string>() as ReadonlySet<string>,
  keyPoints: [] as KeyPoint[],
};

export const useSession = create<SessionState>(() => ({
  video: null,
  opening: false,
  ...EMPTY_ANALYSIS,
}));

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|ogv|avi|3gp)$/i;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXTENSIONS.test(file.name);
}

// ── Key points ───────────────────────────────────────────────────────────────

/** Re-derives the visible key points from candidates, sensitivity and the user's edits. */
export function refreshKeyPoints(): void {
  const { result, manual, dismissed } = useSession.getState();
  const { sensitivity, snapToBeats } = usePrefs.getState();

  const ai = result
    ? selectKeyPoints(result.candidates, {
        duration: result.duration,
        sensitivity,
        beats: result.audio,
        snapToBeats,
      }).filter((k) => !dismissed.has(k.id))
    : [];

  useSession.setState({ keyPoints: [...ai, ...manual].sort((a, b) => a.time - b.time) });
}

usePrefs.subscribe((state, previous) => {
  if (state.sensitivity !== previous.sensitivity || state.snapToBeats !== previous.snapToBeats) refreshKeyPoints();
});

let manualCounter = 0;

export function addKeyPoint(time: number): void {
  const { video, keyPoints } = useSession.getState();
  if (!video) return;
  const t = Math.min(Math.max(time, 0.05), video.info.duration - 0.05);
  if (keyPoints.some((k) => Math.abs(k.time - t) < 0.15)) {
    toast('There is already a key moment here.');
    return;
  }
  const point: KeyPoint = { id: `manual-${Date.now()}-${manualCounter++}`, time: t, strength: 1, kind: 'manual', source: 'manual' };
  useSession.setState((s) => ({ manual: [...s.manual, point] }));
  refreshKeyPoints();
}

export function removeKeyPoint(id: string): void {
  const point = useSession.getState().keyPoints.find((k) => k.id === id);
  if (!point) return;
  if (point.source === 'manual') {
    useSession.setState((s) => ({ manual: s.manual.filter((k) => k.id !== id) }));
  } else {
    useSession.setState((s) => ({ dismissed: new Set(s.dismissed).add(id) }));
  }
  refreshKeyPoints();
}

/** Brings back AI key points the user removed and drops their manual ones. */
export function resetKeyPointEdits(): void {
  useSession.setState({ manual: [], dismissed: new Set() });
  refreshKeyPoints();
}

// ── Analysis lifecycle ───────────────────────────────────────────────────────

let analysisController: AbortController | null = null;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export async function startAnalysis(): Promise<void> {
  const video = useSession.getState().video;
  if (!video) return;

  analysisController?.abort();
  const controller = new AbortController();
  analysisController = controller;

  useSession.setState({ ...EMPTY_ANALYSIS, phase: 'running' });

  try {
    const result = await analyzeVideo({
      file: video.file,
      probe: video.probe,
      signal: controller.signal,
      onStatus: (status) => {
        if (!controller.signal.aborted) useSession.setState({ status });
      },
      onPreview: (canvas, landmarks) => {
        if (controller.signal.aborted) return;
        const state = useSession.getState();
        useSession.setState({
          previewCanvas: state.previewCanvas === canvas ? state.previewCanvas : canvas,
          previewLandmarks: landmarks,
        });
      },
    });
    if (controller.signal.aborted) return;
    useSession.setState({ phase: 'done', result });
    refreshKeyPoints();
  } catch (error) {
    if (controller.signal.aborted || isAbort(error)) return;
    console.error('Analysis failed', error);
    useSession.setState({
      phase: 'failed',
      error: 'Something went wrong while analysing this video.',
    });
  }
}

export function cancelAnalysis(): void {
  if (useSession.getState().phase !== 'running') return;
  analysisController?.abort();
  useSession.setState({ phase: 'cancelled', status: null, previewLandmarks: null });
}

// ── Opening and closing videos ───────────────────────────────────────────────

let openToken = 0;

function friendlyLoadError(error: unknown): string {
  if (error instanceof VideoLoadError) {
    switch (error.reason) {
      case 'unsupported':
      case 'no-video':
        return "Your browser can't play this video. Try an MP4 (H.264) or WebM file.";
      case 'no-duration':
        return "Couldn't read how long this video is. Try re-exporting it as an MP4.";
    }
  }
  return "That video couldn't be opened.";
}

function releaseVideo(video: LoadedVideo | null): void {
  if (!video) return;
  video.probe.dispose();
  URL.revokeObjectURL(video.url);
}

export async function openVideo(file: File): Promise<void> {
  if (!isVideoFile(file)) {
    toast("That doesn't look like a video file.", 'error');
    return;
  }

  const token = ++openToken;
  useSession.setState({ opening: true });

  const url = URL.createObjectURL(file);
  const probe = new FrameProbe(url);
  try {
    const info = await probe.load();
    if (token !== openToken) throw new DOMException('Superseded', 'AbortError');

    analysisController?.abort();
    releaseVideo(useSession.getState().video);

    const video: LoadedVideo = {
      id: `${file.name}-${file.size}-${file.lastModified}-${token}`,
      file,
      url,
      name: file.name.replace(/\.[^.]+$/, ''),
      info,
      probe,
      thumbs: new ThumbnailService(probe),
    };
    useSession.setState({ ...EMPTY_ANALYSIS, video, opening: false });
    setMirrorOnly(false);
    // Every song has its own tempo: start each new video at normal speed.
    usePrefs.getState().set('rate', 1);
    void startAnalysis();
  } catch (error) {
    probe.dispose();
    URL.revokeObjectURL(url);
    if (token !== openToken) return; // a newer file took over
    useSession.setState({ opening: false });
    toast(friendlyLoadError(error), 'error', 6000);
  }
}

export function closeVideo(): void {
  openToken++;
  analysisController?.abort();
  releaseVideo(useSession.getState().video);
  useSession.setState({ video: null, opening: false, ...EMPTY_ANALYSIS });
}
