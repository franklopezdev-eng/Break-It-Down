import { Camera, CameraOff, Film, Lock, RefreshCw, ShieldAlert, VideoOff } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { drawSkeleton, poseAt } from '../analysis/skeleton';
import { cx } from '../lib/cx';
import { chooseArrangement } from '../lib/stage';
import { player, usePlayer } from '../state/player';
import { usePrefs } from '../state/prefs';
import { useSession, type LoadedVideo } from '../state/session';
import { startWebcam, useWebcam, type WebcamStatus } from '../state/webcam';
import { pickVideo } from './FileInput';
import { PlayFill } from './icons';

interface StageProps {
  video: LoadedVideo | null;
}

/**
 * Both panes are always mounted and arranged by CSS (see stage.css), so switching
 * layouts never restarts the video or the camera.
 */
export function Stage({ video }: StageProps) {
  const layout = usePrefs((s) => s.layout);
  const fit = usePrefs((s) => s.mirrorFit);
  const cameraAspect = useWebcam((s) => s.aspect);
  const stage = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Measured before the first paint (so the right arrangement is there from frame one),
  // then kept up to date as the window or layout changes.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const videoAspect = video ? video.info.width / video.info.height : cameraAspect;
  const mirrorAspect = !video || layout === 'mirror' || fit === 'full' ? cameraAspect : videoAspect;
  const arrangement = chooseArrangement(size.width, size.height, videoAspect, mirrorAspect);
  const style = { '--ar-video': videoAspect, '--ar-mirror': mirrorAspect } as CSSProperties;

  return (
    <section
      ref={stage}
      className="stage"
      data-layout={video ? layout : 'mirror'}
      data-arrange={arrangement}
      style={style}
      aria-label="Practice area"
    >
      {video && <VideoPane video={video} />}
      <MirrorPane hasVideo={video !== null} />
    </section>
  );
}

// ── Reference video ──────────────────────────────────────────────────────────

function VideoPane({ video }: { video: LoadedVideo }) {
  const flip = usePrefs((s) => s.flipVideo);
  const layout = usePrefs((s) => s.layout);
  const overlayOpacity = usePrefs((s) => s.overlayOpacity);
  const playing = usePlayer((s) => s.playing);
  const cameraStatus = useWebcam((s) => s.status);

  // The overlay only makes sense with a live camera underneath; without one, show the
  // video at full strength and offer a way to turn the camera on.
  const overlaying = layout === 'overlay' && cameraStatus === 'live';
  const opacity = overlaying ? overlayOpacity : 1;

  return (
    <div className="pane pane--video" data-flipped={flip}>
      <div className="pane__flip" style={{ opacity }}>
        <video
          ref={player.attach}
          src={video.url}
          className="pane__media"
          playsInline
          preload="auto"
          aria-label={`${video.name}`}
          onClick={() => player.toggle()}
        />
        <SkeletonOverlay />
      </div>

      <PaneLabel>
        {overlaying ? `Choreography · ${Math.round(opacity * 100)}%` : 'Choreography'}
        {flip ? ' · Flipped' : ''}
      </PaneLabel>

      {layout === 'overlay' && cameraStatus !== 'live' && <OverlayHint status={cameraStatus} />}

      <button
        type="button"
        className="pane__play"
        data-visible={!playing}
        aria-label="Play"
        tabIndex={playing ? -1 : 0}
        onClick={() => void player.play()}
      >
        <PlayFill size={34} />
      </button>
    </div>
  );
}

function PaneLabel({ children }: { children: ReactNode }) {
  return <div className="pane__label">{children}</div>;
}

function OverlayHint({ status }: { status: WebcamStatus }) {
  const starting = status === 'starting';
  const blocked = status === 'denied' || status === 'unavailable' || status === 'busy' || status === 'error';
  const message = starting
    ? 'Starting camera…'
    : blocked
      ? MESSAGES[status as Exclude<WebcamStatus, 'live'>].title
      : 'Turn on the camera to see yourself under the video';
  return (
    <div className="pane__hint" role="status">
      {starting && <span className="spinner spinner--sm" />}
      <span>{message}</span>
      {!starting && status !== 'insecure' && status !== 'unsupported' && (
        <button type="button" className="btn" onClick={() => void startWebcam()}>
          {blocked ? 'Try Again' : 'Turn On'}
        </button>
      )}
    </div>
  );
}

function SkeletonOverlay() {
  const show = usePrefs((s) => s.showSkeleton);
  const pose = useSession((s) => s.result?.pose ?? null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!show || !pose || !el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastTime = -1;
    let lastKey = '';
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const video = player.element;
      if (!video) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(el.clientWidth * dpr);
      const h = Math.round(el.clientHeight * dpr);
      const key = `${w}x${h}`;
      if (key !== lastKey) {
        el.width = w;
        el.height = h;
        lastKey = key;
        lastTime = -1; // resizing clears the canvas
      }
      const t = video.currentTime;
      if (t === lastTime) return;
      lastTime = t;

      ctx.clearRect(0, 0, w, h);
      const landmarks = poseAt(pose, t);
      if (landmarks) drawSkeleton(ctx, landmarks, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [show, pose]);

  if (!show || !pose) return null;
  return <canvas ref={canvas} className="pane__skeleton" aria-hidden="true" />;
}

// ── Mirror ───────────────────────────────────────────────────────────────────

function MirrorPane({ hasVideo }: { hasVideo: boolean }) {
  const status = useWebcam((s) => s.status);
  const stream = useWebcam((s) => s.stream);
  const mirrored = usePrefs((s) => s.mirrorCamera);
  const layout = usePrefs((s) => s.layout);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);

  const live = status === 'live';
  return (
    <div className="pane pane--mirror" data-status={status}>
      <video ref={ref} className={cx('pane__media', mirrored && 'is-mirrored')} muted playsInline autoPlay aria-label="Your camera" />
      {live ? (
        <>
          <PaneLabel>{layout === 'overlay' && hasVideo ? 'You · Mirror' : 'You'}</PaneLabel>
          <div className="pane__live">
            <span className="pane__live-dot" aria-hidden="true" />
            Live
          </div>
        </>
      ) : (
        <MirrorPlaceholder status={status} hasVideo={hasVideo} />
      )}
    </div>
  );
}

const MESSAGES: Record<Exclude<WebcamStatus, 'live'>, { icon: ReactNode; title: string; body: string; retry: boolean }> = {
  off: {
    icon: <Camera size={30} strokeWidth={1.6} />,
    title: 'Mirror',
    body: 'See yourself next to the choreography. The camera image never leaves this device.',
    retry: false,
  },
  starting: {
    icon: <span className="spinner spinner--lg" />,
    title: 'Starting camera…',
    body: 'If your browser asks, choose Allow.',
    retry: false,
  },
  denied: {
    icon: <ShieldAlert size={30} strokeWidth={1.6} />,
    title: 'Camera access is blocked',
    body: 'Allow the camera for this site from the lock icon in your address bar, then try again.',
    retry: true,
  },
  unavailable: {
    icon: <VideoOff size={30} strokeWidth={1.6} />,
    title: 'No camera found',
    body: 'Connect a camera, or check that it isn’t turned off in your system settings.',
    retry: true,
  },
  busy: {
    icon: <CameraOff size={30} strokeWidth={1.6} />,
    title: 'Camera is in use',
    body: 'Another app is using your camera. Close it, then try again.',
    retry: true,
  },
  insecure: {
    icon: <Lock size={30} strokeWidth={1.6} />,
    title: 'Camera needs a secure page',
    body: 'Browsers only allow camera access on HTTPS pages or localhost.',
    retry: false,
  },
  unsupported: {
    icon: <CameraOff size={30} strokeWidth={1.6} />,
    title: 'Camera isn’t supported',
    body: 'This browser can’t access a camera. Try a current version of Safari, Chrome, Edge or Firefox.',
    retry: false,
  },
  error: {
    icon: <CameraOff size={30} strokeWidth={1.6} />,
    title: 'Couldn’t start the camera',
    body: 'Something went wrong while opening it. Try again in a moment.',
    retry: true,
  },
};

function MirrorPlaceholder({ status, hasVideo }: { status: Exclude<WebcamStatus, 'live'>; hasVideo: boolean }) {
  const m = MESSAGES[status];
  return (
    <div className="pane__empty" role="status">
      <div className="pane__empty-icon">{m.icon}</div>
      <div className="t-headline">{m.title}</div>
      <p className="t-footnote pane__empty-body">{m.body}</p>
      {status === 'off' && (
        <button type="button" className="btn btn--primary" onClick={() => void startWebcam()}>
          <Camera size={18} strokeWidth={2} /> Turn On Camera
        </button>
      )}
      {m.retry && (
        <button type="button" className="btn btn--tinted" onClick={() => void startWebcam()}>
          <RefreshCw size={16} strokeWidth={2.2} /> Try Again
        </button>
      )}
      {!hasVideo && status !== 'starting' && (
        <button type="button" className="btn btn--plain pane__empty-link" onClick={pickVideo}>
          <Film size={16} strokeWidth={2} /> Choose a Video
        </button>
      )}
    </div>
  );
}
