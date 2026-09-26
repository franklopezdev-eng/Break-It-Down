import { fitWithin, type FrameProbe } from './probe';

const THUMB_SIDE = 200;

/**
 * Cuts small JPEG stills out of the video, one at a time, sharing the analysis
 * probe. Results are cached by 0.1 s bucket, so re-rendering a list is free.
 */
export class ThumbnailService {
  private readonly cache = new Map<number, string>();
  private readonly pending = new Map<number, Promise<string | null>>();
  private readonly canvas = document.createElement('canvas');

  constructor(private readonly probe: FrameProbe) {
    const { width, height } = fitWithin(probe.info.width, probe.info.height, THUMB_SIDE);
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private key(time: number): number {
    return Math.round(time * 10);
  }

  /** Already-rendered thumbnail, if any. */
  peek(time: number): string | null {
    return this.cache.get(this.key(time)) ?? null;
  }

  get(time: number): Promise<string | null> {
    const key = this.key(time);
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);

    let request = this.pending.get(key);
    if (!request) {
      request = this.probe
        .run(async () => {
          await this.probe.seek(key / 10);
          const ctx = this.canvas.getContext('2d')!;
          ctx.drawImage(this.probe.video, 0, 0, this.canvas.width, this.canvas.height);
          return this.canvas.toDataURL('image/jpeg', 0.72);
        })
        .then((url) => {
          this.cache.set(key, url);
          return url;
        })
        .catch(() => null)
        .finally(() => this.pending.delete(key));
      this.pending.set(key, request);
    }
    return request;
  }
}
