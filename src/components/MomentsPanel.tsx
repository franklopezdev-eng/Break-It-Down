import {
  Check,
  Flag,
  Flame,
  Info,
  Layers,
  Minus,
  Plus,
  Repeat,
  RotateCcw,
  Snowflake,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { drawSkeleton } from '../analysis/skeleton';
import { useThumbnail } from '../hooks/useThumbnail';
import { cx } from '../lib/cx';
import { formatTime, plural } from '../lib/format';
import { KIND_HINT, KIND_LABEL, type MomentKind } from '../lib/kinds';
import { player, usePlayer } from '../state/player';
import { usePrefs } from '../state/prefs';
import {
  addKeyPoint,
  cancelAnalysis,
  removeKeyPoint,
  resetKeyPointEdits,
  startAnalysis,
  useSession,
  type LoadedVideo,
} from '../state/session';
import { IconButton, Slider, ToggleRow } from './ui';

const KIND_ICON: Record<MomentKind, ReactNode> = {
  start: <Minus size={14} strokeWidth={2.4} />,
  hit: <Zap size={14} strokeWidth={2.2} />,
  hold: <Snowflake size={14} strokeWidth={2.2} />,
  peak: <Flame size={14} strokeWidth={2.2} />,
  section: <Layers size={14} strokeWidth={2.2} />,
  manual: <Flag size={14} strokeWidth={2.2} />,
};

export function MomentsPanel({ video }: { video: LoadedVideo }) {
  const keyPoints = useSession((s) => s.keyPoints);
  const phase = useSession((s) => s.phase);
  const duration = usePlayer((s) => s.duration) || video.info.duration;

  // Which section the playhead is in. Selecting an index (not the time) means the
  // panel only re-renders when the playhead crosses a key point.
  const times = keyPoints.map((k) => k.time);
  const activeIndex = usePlayer((s) => {
    let index = 0; // row 0 is the implicit "Start" section
    for (let i = 0; i < times.length; i++) if (times[i] <= s.time + 0.001) index = i + 1;
    return index;
  });

  const rows: { id: string; time: number; kind: MomentKind; strength: number }[] = [
    { id: 'start', time: 0, kind: 'start', strength: 0 },
    ...keyPoints,
  ];

  return (
    <section className="panel glass" aria-label="Key moments">
      <header className="panel__head">
        <h2 className="t-title3">Key Moments</h2>
        {keyPoints.length > 0 && <span className="badge tabular">{keyPoints.length}</span>}
        <span className="panel__spacer" />
        <IconButton
          label="Add a key moment at the playhead (A)"
          size="sm"
          tone="tinted"
          onClick={() => addKeyPoint(usePlayer.getState().time)}
        >
          <Plus size={18} strokeWidth={2.4} />
        </IconButton>
      </header>

      <div className="panel__body">
        <AnalysisCard />

        {phase === 'done' && <Sensitivity />}

        <ol className="moments" aria-label="Sections">
          {rows.map((row, i) => (
            <MomentRow
              key={row.id}
              video={video}
              index={i}
              row={row}
              end={rows[i + 1]?.time ?? duration}
              active={i === activeIndex}
            />
          ))}
        </ol>

        {phase === 'done' && keyPoints.length === 0 && (
          <p className="panel__empty t-footnote t-secondary">
            No key moments found at this sensitivity. Raise it above, or press <kbd>A</kbd> to mark moments yourself.
          </p>
        )}
      </div>
    </section>
  );
}

// ── One moment ───────────────────────────────────────────────────────────────

function MomentRow({
  video,
  row,
  index,
  end,
  active,
}: {
  video: LoadedVideo;
  row: { id: string; time: number; kind: MomentKind; strength: number };
  index: number;
  end: number;
  active: boolean;
}) {
  const src = useThumbnail(video, row.time);
  const looping = usePlayer((s) => s.loop.enabled && Math.abs(s.loop.start - row.time) < 0.05 && Math.abs(s.loop.end - end) < 0.05);
  const li = useRef<HTMLLIElement>(null);

  // Keep the current section visible while the video plays.
  useEffect(() => {
    if (active && usePlayer.getState().playing) li.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  const length = Math.max(0, end - row.time);
  return (
    <li ref={li} className="moment" data-active={active} data-kind={row.kind}>
      <button
        type="button"
        className="moment__main"
        title={KIND_HINT[row.kind]}
        onClick={() => player.jumpToKeyPoint(row.time)}
      >
        <span className="moment__thumb" style={{ aspectRatio: 9 / 16}}>
          {src ? <img src={src} alt="" draggable={false} /> : <span className="moment__thumb-empty" />}
          <span className="moment__num tabular">{index + 1}</span>
        </span>
        <span className="moment__text">
          <span className="moment__title">
            <span className="moment__kind" aria-hidden="true">
              {KIND_ICON[row.kind]}
            </span>
            {KIND_LABEL[row.kind]}
          </span>
          <span className="moment__meta tabular">
            {formatTime(row.time, 1)} · {length.toFixed(1)}s
          </span>
        </span>
      </button>
      <div className="moment__actions">
        <IconButton
          label={looping ? 'Stop looping this section' : `Loop ${formatTime(row.time, 1)} to ${formatTime(end, 1)}`}
          size="sm"
          tone="glass"
          aria-pressed={looping}
          onClick={() => (looping ? player.disableLoop() : player.loopRange({ start: row.time, end }))}
        >
          <Repeat size={15} strokeWidth={2.3} />
        </IconButton>
        {row.kind !== 'start' && (
          <IconButton
            label={`Remove key moment at ${formatTime(row.time, 1)}`}
            size="sm"
            tone="plain"
            className="moment__remove"
            onClick={() => removeKeyPoint(row.id)}
          >
            <X size={15} strokeWidth={2.4} />
          </IconButton>
        )}
      </div>
    </li>
  );
}

// ── Sensitivity ──────────────────────────────────────────────────────────────

function Sensitivity() {
  const sensitivity = usePrefs((s) => s.sensitivity);
  const snap = usePrefs((s) => s.snapToBeats);
  const set = usePrefs((s) => s.set);
  const audio = useSession((s) => s.result?.audio ?? null);
  const edited = useSession((s) => s.manual.length > 0 || s.dismissed.size > 0);

  return (
    <div className="sensitivity">
      <div className="sensitivity__head">
        <label htmlFor="sensitivity" className="t-subhead" style={{ fontWeight: 600 }}>
          Sensitivity
        </label>
        {edited && (
          <button type="button" className="btn btn--plain btn--sm" onClick={resetKeyPointEdits}>
            <RotateCcw size={13} strokeWidth={2.4} /> Reset edits
          </button>
        )}
      </div>
      <Slider
        label="Key moment sensitivity"
        min={0}
        max={1}
        step={0.01}
        value={sensitivity}
        onChange={(v) => set('sensitivity', v)}
        valueText={`${Math.round(sensitivity * 100)} percent`}
      />
      <div className="sensitivity__ends t-caption t-tertiary" aria-hidden="true">
        <span>Fewer</span>
        <span>More</span>
      </div>
      {audio && audio.confidence >= 0.35 && (
        <ToggleRow
          title="Snap to the beat"
          hint={`${Math.round(audio.bpm)} BPM detected`}
          checked={snap}
          onChange={(v) => set('snapToBeats', v)}
        />
      )}
    </div>
  );
}

// ── Analysis status ──────────────────────────────────────────────────────────

function AnalysisCard() {
  const phase = useSession((s) => s.phase);
  const status = useSession((s) => s.status);
  const result = useSession((s) => s.result);
  const keyPoints = useSession((s) => s.keyPoints);

  if (phase === 'running' && status) {
    const percent = Math.round(status.overall * 100);
    const motionDetail =
      status.pose === 'loading'
        ? status.modelProgress !== null
          ? `Downloading pose model · ${Math.round(status.modelProgress * 100)}%`
          : 'Loading pose model…'
        : status.pose === 'unavailable'
          ? `Measuring motion · ${Math.round(status.motion * 100)}%`
          : `Tracking dancer · ${Math.round(status.motion * 100)}%`;

    return (
      <div className="analysis" role="group" aria-label="Analysis progress">
        <div className="analysis__head">
          <Sparkles size={18} strokeWidth={2.2} className="analysis__spark" />
          <span className="t-headline">Analyzing choreography</span>
          <span className="analysis__percent tabular">{percent}%</span>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="progress__bar" style={{ width: `${percent}%` }} />
        </div>
        <div className="analysis__body">
          <Preview />
          <ul className="steps">
            <Step
              state={status.audio === 'running' ? 'active' : status.audio === 'done' ? 'done' : 'skipped'}
              label="Listening to the music"
              detail={status.audio === 'skipped' ? 'No usable audio' : undefined}
            />
            <Step
              state={status.motion >= 1 ? 'done' : 'active'}
              label="Following the movement"
              detail={status.motion >= 1 ? undefined : motionDetail}
            />
            <Step
              state={status.moments === 'done' ? 'done' : status.moments === 'running' ? 'active' : 'pending'}
              label="Finding key moments"
            />
          </ul>
        </div>
        <div className="analysis__foot">
          <span className="t-caption t-tertiary">Runs on your device. Nothing is uploaded.</span>
          <button type="button" className="btn btn--tinted btn--sm" onClick={cancelAnalysis}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done' && result) {
    const details = [
      result.audio ? `${Math.round(result.audio.bpm)} BPM` : null,
      result.usedPose ? `Dancer tracked in ${Math.round(result.poseCoverage * 100)}% of frames` : 'Motion analysis',
    ].filter(Boolean);
    return (
      <div className="analysis analysis--done">
        <div className="analysis__summary">
          <span className="analysis__badge" aria-hidden="true">
            <Sparkles size={16} strokeWidth={2.3} />
          </span>
          <div className="analysis__text">
            <div className="t-headline">{plural(keyPoints.length, 'key moment')}</div>
            <div className="t-footnote t-secondary">{details.join(' · ')}</div>
          </div>
          <IconButton label="Analyze again" size="sm" tone="glass" onClick={() => void startAnalysis()}>
            <RotateCcw size={15} strokeWidth={2.3} />
          </IconButton>
        </div>
        {!result.usedPose && (
          <p className="analysis__note t-caption t-secondary">
            <Info size={13} strokeWidth={2.2} aria-hidden="true" />
            {!result.poseRan
              ? 'Pose tracking couldn’t start, so movement was measured from the picture itself.'
              : result.poseCoverage > 0
                ? 'The dancer was only tracked in part of this video, so movement was measured from the picture itself.'
                : 'No dancer was found to track, so movement was measured from the picture itself.'}
          </p>
        )}
      </div>
    );
  }

  if (phase === 'failed' || phase === 'cancelled') {
    return (
      <div className="analysis analysis--done">
        <div className="analysis__summary">
          <div className="analysis__text">
            <div className="t-headline">{phase === 'failed' ? 'Analysis failed' : 'Analysis stopped'}</div>
            <div className="t-footnote t-secondary">
              You can still scrub, loop and add key moments by hand.
            </div>
          </div>
          <button type="button" className="btn btn--tinted btn--sm" onClick={() => void startAnalysis()}>
            {phase === 'failed' ? 'Retry' : 'Analyze'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function Step({ state, label, detail }: { state: 'pending' | 'active' | 'done' | 'skipped'; label: string; detail?: string }) {
  return (
    <li className={cx('step', `step--${state}`)}>
      <span className="step__icon" aria-hidden="true">
        {state === 'done' ? <Check size={12} strokeWidth={3.2} /> : state === 'active' ? <span className="spinner spinner--sm" /> : null}
      </span>
      <span className="step__text">
        <span className="step__label">{label}</span>
        {detail && <span className="step__detail t-caption">{detail}</span>}
      </span>
    </li>
  );
}

/** The frame being analysed right now, with the tracked skeleton drawn over it. */
function Preview() {
  const frame = useSession((s) => s.previewCanvas);
  const landmarks = useSession((s) => s.previewLandmarks);
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !frame) return;
    frame.className = 'preview__frame';
    el.prepend(frame);
    return () => frame.remove();
  }, [frame]);

  useEffect(() => {
    const el = overlay.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    if (landmarks) drawSkeleton(ctx, landmarks, w, h);
  }, [landmarks]);

  const aspect = frame ? frame.width / frame.height : 16 / 9;
  return (
    <div
      ref={host}
      className="preview"
      style={{ aspectRatio: String(Math.min(Math.max(aspect, 0.6), 1.8)) }}
    >
      <canvas ref={overlay} className="preview__overlay" />
    </div>
  );
}
