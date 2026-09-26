import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { snapToNearest } from '../analysis/keypoints';
import { clamp } from '../analysis/signal';
import { useThumbnail } from '../hooks/useThumbnail';
import { formatTime } from '../lib/format';
import { KIND_LABEL } from '../lib/kinds';
import { normalizeRange, MIN_LOOP, sectionAt } from '../lib/loop';
import { player, usePlayer } from '../state/player';
import { usePrefs } from '../state/prefs';
import { useSession, type LoadedVideo } from '../state/session';

const BAR = 3;
const GAP = 2;
const HEIGHT = 76;
/** How close (in pixels) a dragged handle must get before it snaps to a target. */
const SNAP_PX = 9;

/** Movement intensity per bar; a flat, gently varying placeholder while there's no analysis. */
function barValues(energy: Float32Array | null, rate: number, duration: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!energy) {
      out.push(0.1 + 0.06 * Math.sin(i * 0.55) + 0.04 * Math.sin(i * 1.7 + 1));
      continue;
    }
    const from = Math.floor(((i / count) * duration) * rate);
    const to = Math.max(from + 1, Math.ceil((((i + 1) / count) * duration) * rate));
    let max = 0;
    let sum = 0;
    let n = 0;
    for (let k = from; k < to && k < energy.length; k++) {
      max = Math.max(max, energy[k]);
      sum += energy[k];
      n++;
    }
    out.push(n ? 0.55 * max + 0.45 * (sum / n) : 0);
  }
  return out;
}

function barsPath(values: number[]): string {
  const min = 6;
  const cy = HEIGHT / 2;
  const span = HEIGHT - 20;
  let d = '';
  values.forEach((v, i) => {
    const h = min + (span - min) * Math.pow(clamp(v), 0.8);
    const x = (i * (BAR + GAP) + BAR / 2).toFixed(1);
    d += `M${x} ${(cy - h / 2).toFixed(1)}V${(cy + h / 2).toFixed(1)}`;
  });
  return d;
}

export function Timeline({ video }: { video: LoadedVideo }) {
  const playerDuration = usePlayer((s) => s.duration);
  const duration = playerDuration || video.info.duration;
  const loop = usePlayer((s) => s.loop);
  const keyPoints = useSession((s) => s.keyPoints);
  const result = useSession((s) => s.result);
  const phase = useSession((s) => s.phase);
  const overall = useSession((s) => s.status?.overall ?? 0);
  const showBeats = usePrefs((s) => s.showBeats);
  const snapBeats = usePrefs((s) => s.snapToBeats);

  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const scrubbing = useRef<{ resume: boolean } | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Playhead position is a CSS variable, updated straight from the store so playback
  // doesn't re-render React sixty times a second.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let lastSecond = -1;
    const apply = (t: number) => {
      el.style.setProperty('--progress', String(duration ? clamp(t / duration) : 0));
      // Assistive tech hears whole seconds only; announcing every frame would be noise.
      const second = Math.floor(t);
      if (second !== lastSecond) {
        lastSecond = second;
        track.current?.setAttribute('aria-valuenow', String(second));
        track.current?.setAttribute('aria-valuetext', `${formatTime(t)} of ${formatTime(duration)}`);
      }
    };
    apply(usePlayer.getState().time);
    return usePlayer.subscribe((s) => apply(s.time));
  }, [duration]);

  const barCount = Math.max(1, Math.floor((width + GAP) / (BAR + GAP)));
  const paths = useMemo(() => {
    if (!width) return { wave: '', beats: '' };
    const values = barValues(result?.energy ?? null, result?.rate ?? 1, duration, barCount);
    let beats = '';
    const grid = result?.audio;
    if (grid && grid.confidence >= 0.35 && width / grid.beats.length >= 5) {
      for (const b of grid.beats) {
        if (b < 0 || b > duration) continue;
        const x = ((b / duration) * width).toFixed(1);
        beats += `M${x} ${HEIGHT - 9}V${HEIGHT - 3}`;
      }
    }
    return { wave: barsPath(values), beats };
  }, [width, barCount, result, duration]);

  const keyTimes = useMemo(() => keyPoints.map((k) => k.time), [keyPoints]);

  const timeAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width) * duration;
  };

  // ── Scrubbing ──────────────────────────────────────────────────────────────
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbing.current = { resume: usePlayer.getState().playing };
    player.pause();
    player.seek(timeAt(event.clientX));
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const time = timeAt(event.clientX);
    if (event.pointerType === 'mouse' || scrubbing.current) {
      const rect = track.current!.getBoundingClientRect();
      setHover({ x: event.clientX - rect.left, time });
    }
    if (scrubbing.current) player.seek(time);
  };
  const endScrub = () => {
    const state = scrubbing.current;
    scrubbing.current = null;
    if (state?.resume) void player.play();
  };

  // ── Loop handles ───────────────────────────────────────────────────────────
  const dragHandle = (edge: 'start' | 'end') => (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const rect = track.current!.getBoundingClientRect();
    const majors = [0, ...keyTimes, duration];
    const beats = snapBeats ? result?.audio?.beats ?? [] : [];
    const tolerance = (SNAP_PX / rect.width) * duration;

    const move = (e: PointerEvent) => {
      let t = clamp((e.clientX - rect.left) / rect.width) * duration;
      const major = snapToNearest(t, majors, tolerance);
      t = major !== t ? major : snapToNearest(t, beats, tolerance * 0.55);
      const { loop: current } = usePlayer.getState();
      const next =
        edge === 'start'
          ? { start: Math.min(t, current.end - MIN_LOOP), end: current.end }
          : { start: current.start, end: Math.max(t, current.start + MIN_LOOP) };
      player.setLoopRange(normalizeRange(next, duration));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const nudgeHandle = (edge: 'start' | 'end') => (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 0.1 : event.key === 'ArrowLeft' ? -0.1 : 0;
    if (!step) return;
    event.preventDefault();
    const current = usePlayer.getState().loop;
    const amount = event.shiftKey ? step * 10 : step;
    const next = edge === 'start' ? { start: current.start + amount, end: current.end } : { start: current.start, end: current.end + amount };
    player.setLoopRange(normalizeRange(next, duration));
  };

  // ── Keyboard on the track itself ───────────────────────────────────────────
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
        player.nudge(event.shiftKey ? -5 : -1);
        break;
      case 'ArrowRight':
        player.nudge(event.shiftKey ? 5 : 1);
        break;
      case 'PageUp':
        player.previousKeyPoint();
        break;
      case 'PageDown':
        player.nextKeyPoint();
        break;
      case 'Home':
        player.seek(0);
        break;
      case 'End':
        player.seek(duration);
        break;
      default:
        return;
    }
    event.preventDefault(); // tells the global shortcuts this one is handled
  };

  const analyzing = phase === 'running';
  const loopStyle = { '--start': loop.start / duration, '--end': loop.end / duration } as CSSProperties;

  return (
    <div className="timeline" ref={root} data-analyzing={analyzing} style={{ '--h': `${HEIGHT}px` } as CSSProperties}>
      <div
        ref={track}
        className="timeline__track"
        role="slider"
        tabIndex={0}
        aria-label="Timeline"
        aria-describedby="timeline-hint"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerLeave={() => !scrubbing.current && setHover(null)}
        onDoubleClick={(event) => player.loopRange(sectionAt(keyTimes, duration, timeAt(event.clientX)))}
        onKeyDown={onKeyDown}
      >
        <div className="timeline__clip">
          {loop.enabled && <div className="timeline__loop-fill" style={loopStyle} />}
          <svg className="timeline__svg" width={width} height={HEIGHT} aria-hidden="true">
            <path className="timeline__wave" d={paths.wave} />
            <path className="timeline__wave timeline__wave--played" d={paths.wave} />
            {showBeats && <path className="timeline__beats" d={paths.beats} />}
          </svg>
        </div>

        {analyzing && (
          <span className="timeline__status" aria-live="polite">
            <span className="spinner" /> Analyzing movement · {Math.round(overall * 100)}%
          </span>
        )}

        {keyPoints.map((kp) => (
          <button
            key={kp.id}
            type="button"
            className="marker"
            data-kind={kp.kind}
            style={{ '--x': kp.time / duration } as CSSProperties}
            title={`${KIND_LABEL[kp.kind]} · ${formatTime(kp.time, 1)}`}
            aria-label={`${KIND_LABEL[kp.kind]} at ${formatTime(kp.time, 1)}`}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={() => player.jumpToKeyPoint(kp.time)}
          />
        ))}

        {loop.enabled && (
          <div className="timeline__loop" style={loopStyle}>
            <span
              className="loop-handle loop-handle--start"
              role="slider"
              tabIndex={0}
              aria-label="Loop start"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(loop.start * 10) / 10}
              aria-valuetext={formatTime(loop.start, 1)}
              onPointerDown={dragHandle('start')}
              onKeyDown={nudgeHandle('start')}
              onDoubleClick={(event) => event.stopPropagation()}
            />
            <span
              className="loop-handle loop-handle--end"
              role="slider"
              tabIndex={0}
              aria-label="Loop end"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(loop.end * 10) / 10}
              aria-valuetext={formatTime(loop.end, 1)}
              onPointerDown={dragHandle('end')}
              onKeyDown={nudgeHandle('end')}
              onDoubleClick={(event) => event.stopPropagation()}
            />
          </div>
        )}

        <div className="timeline__playhead" aria-hidden="true" />
        {hover && <HoverTip x={hover.x} time={hover.time} width={width} video={video} />}
      </div>

      <span id="timeline-hint" className="sr-only">
        Arrow keys scrub, Page Up and Page Down jump between key moments, double-click a section to loop it.
      </span>
      <div className="timeline__times tabular">
        <LiveTime />
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function HoverTip({ x, time, width, video }: { x: number; time: number; width: number; video: LoadedVideo }) {
  const src = useThumbnail(video, time, 90);
  const half = 58;
  const left = clamp(x, half, Math.max(half, width - half));
  const aspect = video.info.width / video.info.height;
  return (
    <div className="timeline__tip" style={{ left }}>
      {src ? (
        <img src={src} alt="" style={{ aspectRatio: String(aspect) }} />
      ) : (
        <div className="timeline__tip-img" style={{ aspectRatio: String(aspect) }} />
      )}
      <span className="tabular">{formatTime(time, 1)}</span>
    </div>
  );
}

/** The running time, written straight into the DOM so it can tick every frame for free. */
function LiveTime() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (t: number) => {
      el.textContent = formatTime(t, 1);
    };
    apply(usePlayer.getState().time);
    return usePlayer.subscribe((s) => apply(s.time));
  }, []);
  return <span ref={ref} />;
}
