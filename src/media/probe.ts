/**
 * A hidden <video> we can seek around freely without disturbing the player.
 * Analysis reads frames from it, and thumbnails are cut from it afterwards.
 * Everything that touches the element goes through `run`, which serialises access
 * so analysis and thumbnail requests can share it safely.
 */

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

export type VideoLoadReason = 'unsupported' | 'no-video' | 'no-duration' | 'failed';

export class VideoLoadError extends Error {
  readonly reason: VideoLoadReason;
  constructor(message: string, reason: VideoLoadReason) {
    super(message);
    this.name = 'VideoLoadError';
    this.reason = reason;
  }
}

/**
 * Safari can fire `seeked` before the new frame is actually paintable, so it needs
 * one extra video-frame callback before drawing. Chromium and Firefox don't.
 */
const NEEDS_FRAME_CALLBACK =
  typeof navigator !== 'undefined' &&
  typeof HTMLVideoElement !== 'undefined' &&
  'requestVideoFrameCallback' in HTMLVideoElement.prototype &&
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export class FrameProbe {
  readonly video: HTMLVideoElement;
  info: VideoInfo = { duration: 0, width: 0, height: 0 };
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(url: string) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    // Off-screen but attached: some browsers won't decode frames for detached elements.
    video.style.cssText =
      'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);
    video.src = url;
    this.video = video;
  }

  /** Waits for the metadata and first frame, and validates that there is real video. */
  async load(): Promise<VideoInfo> {
    const v = this.video;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => fail('failed'), 20_000);
      const cleanup = () => {
        window.clearTimeout(timer);
        v.removeEventListener('loadedmetadata', ok);
        v.removeEventListener('error', onError);
      };
      const ok = () => {
        cleanup();
        resolve();
      };
      const fail = (reason: VideoLoadReason) => {
        cleanup();
        reject(new VideoLoadError('This video could not be opened.', reason));
      };
      const onError = () => fail('unsupported');
      if (v.readyState >= 1) return ok();
      v.addEventListener('loadedmetadata', ok);
      v.addEventListener('error', onError);
    });

    if (!Number.isFinite(v.duration)) await resolveInfiniteDuration(v);

    if (!v.videoWidth || !v.videoHeight) {
      throw new VideoLoadError('This file has no video track your browser can decode.', 'no-video');
    }
    if (!(v.duration > 0) || !Number.isFinite(v.duration)) {
      throw new VideoLoadError("Couldn't work out how long this video is.", 'no-duration');
    }

    this.info = { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
    await this.seek(0); // makes sure the first frame is decoded and drawable
    return this.info;
  }

  /** Resolves once the frame at `time` is ready to be drawn. */
  seek(time: number): Promise<void> {
    const v = this.video;
    const limit = this.info.duration > 0 ? this.info.duration - 0.001 : v.duration;
    const target = Math.min(Math.max(0, time), Number.isFinite(limit) ? limit : time);

    return new Promise<void>((resolve) => {
      if (this.disposed || (!v.seeking && Math.abs(v.currentTime - target) < 1e-4 && v.readyState >= 2)) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        v.removeEventListener('seeked', onSeeked);
        resolve();
      };
      const onSeeked = () => {
        if (NEEDS_FRAME_CALLBACK) {
          v.requestVideoFrameCallback(() => done());
          window.setTimeout(done, 150);
        } else {
          done();
        }
      };
      const timer = window.setTimeout(done, 5000); // never hang the analysis on a stuck decoder
      v.addEventListener('seeked', onSeeked);
      v.currentTime = target;
    });
  }

  /** Runs `task` once every earlier task has finished. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  dispose(): void {
    this.disposed = true;
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
  }
}

/**
 * Recorder-produced WebM files report an infinite duration (and can't be seeked
 * reliably) until the parser has been forced to the end of the file. Seeking far
 * past the end makes the browser work out the real length.
 */
export function resolveInfiniteDuration(v: HTMLVideoElement): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new VideoLoadError("Couldn't work out how long this video is.", 'no-duration'));
    }, 8000);
    const check = () => {
      if (!Number.isFinite(v.duration)) return;
      cleanup();
      v.currentTime = 0;
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      v.removeEventListener('durationchange', check);
      v.removeEventListener('timeupdate', check);
    };
    v.addEventListener('durationchange', check);
    v.addEventListener('timeupdate', check);
    v.currentTime = Number.MAX_SAFE_INTEGER;
  });
}

/** Fits (width × height) inside `maxSide` on the longer edge, never upscaling. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(2, Math.round(width * scale)), height: Math.max(2, Math.round(height * scale)) };
}
