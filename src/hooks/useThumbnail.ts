import { useEffect, useState } from 'react';
import type { LoadedVideo } from '../state/session';

/**
 * A still from `video` at `time`, as a data URL. Returns null until it has been cut
 * (thumbnails are rendered lazily, one at a time). `delay` debounces rapid changes,
 * like hovering across the timeline.
 */
export function useThumbnail(video: LoadedVideo | null, time: number | null, delay = 0): string | null {
  const [src, setSrc] = useState<string | null>(() => (video && time !== null ? video.thumbs.peek(time) : null));

  useEffect(() => {
    if (!video || time === null) {
      setSrc(null);
      return;
    }
    const cached = video.thumbs.peek(time);
    if (cached) {
      setSrc(cached);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      void video.thumbs.get(time).then((url) => {
        if (alive && url) setSrc(url);
      });
    }, delay);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [video, time, delay]);

  return src;
}
