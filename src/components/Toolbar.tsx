import {
  Camera,
  CameraOff,
  ChevronLeft,
  Columns2,
  Eye,
  Film,
  Keyboard,
  Layers,
  Maximize,
  Minimize,
  Upload,
} from 'lucide-react';
import { usePrefs, type Layout } from '../state/prefs';
import { useSession } from '../state/session';
import { setMirrorOnly, setShortcutsOpen, toggleFullscreen, useUI } from '../state/ui';
import { selectCamera, startWebcam, stopWebcam, toggleWebcam, useWebcam } from '../state/webcam';
import { pickVideo } from './FileInput';
import { LogoMark } from './icons';
import { IconButton, Popover, SegmentedControl, Slider, ToggleRow, type SegmentOption } from './ui';

const LAYOUT_OPTIONS: SegmentOption<Layout>[] = [
  { value: 'video', label: 'Video', title: 'Choreography only', icon: <Film size={15} strokeWidth={2.2} /> },
  { value: 'split', label: 'Split', title: 'Side by side', icon: <Columns2 size={15} strokeWidth={2.2} /> },
  { value: 'overlay', label: 'Overlay', title: 'Mirror underneath the choreography', icon: <Layers size={15} strokeWidth={2.2} /> },
  
];

export function Toolbar() {
  const video = useSession((s) => s.video);
  const mirrorOnly = useUI((s) => s.mirrorOnly);
  const layout = usePrefs((s) => s.layout);
  const set = usePrefs((s) => s.set);
  const inWorkspace = video !== null;

  const chooseLayout = (next: Layout) => {
    set('layout', next);
    // Picking a mirror layout is a clear request to see yourself.
    if ((next === 'overlay') && useWebcam.getState().status === 'off') void startWebcam();
  };

  return (
    <header className="toolbar" role="banner">
      <div className="toolbar__start">
        {mirrorOnly && !inWorkspace && (
          <IconButton
            label="Back"
            tone="plain"
            size="sm"
            onClick={() => {
              setMirrorOnly(false);
              stopWebcam(); // leaving the mirror ends the camera session
            }}
          >
            <ChevronLeft size={22} strokeWidth={2.2} />
          </IconButton>
        )}
        <div className="brand">
          <LogoMark size={30} className="brand__mark" />
          <span className="brand__name">Break It Down</span>
        </div>
      </div>

      <div className="toolbar__center">
        {inWorkspace && (
          <SegmentedControl<Layout> label="Layout" value={layout} onChange={chooseLayout} options={LAYOUT_OPTIONS} />
        )}
      </div>

      <div className="toolbar__end">
        {(inWorkspace || mirrorOnly) && <CameraButton />}
        {(inWorkspace || mirrorOnly) && <ViewMenu inWorkspace={inWorkspace} />}
        {(inWorkspace || mirrorOnly) && <FullscreenButton />}
        <IconButton label="Keyboard shortcuts (?)" tone="plain" onClick={() => setShortcutsOpen(true)} className="toolbar__help">
          <Keyboard size={20} strokeWidth={1.9} />
        </IconButton>
        {(inWorkspace || mirrorOnly) && (
          <button type="button" className="btn btn--tinted btn--sm toolbar__open" onClick={pickVideo}>
            <Upload size={15} strokeWidth={2.3} />
            <span>{inWorkspace ? 'New Video' : 'Choose Video'}</span>
          </button>
        )}
      </div>
    </header>
  );
}

function CameraButton() {
  const status = useWebcam((s) => s.status);
  const live = status === 'live';
  const starting = status === 'starting';
  return (
    <IconButton
      label={live ? 'Turn camera off (C)' : 'Turn camera on (C)'}
      tone="glass"
      aria-pressed={live}
      onClick={toggleWebcam}
      className="camera-btn"
      data-live={live}
    >
      {starting ? <span className="spinner" /> : live ? <Camera size={20} strokeWidth={2} /> : <CameraOff size={20} strokeWidth={2} />}
    </IconButton>
  );
}

function FullscreenButton() {
  const fullscreen = useUI((s) => s.fullscreen);
  if (!document.fullscreenEnabled) return null;
  return (
    <IconButton
      label={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
      tone="plain"
      className="toolbar__fullscreen"
      onClick={toggleFullscreen}
    >
      {fullscreen ? <Minimize size={20} strokeWidth={1.9} /> : <Maximize size={20} strokeWidth={1.9} />}
    </IconButton>
  );
}

function ViewMenu({ inWorkspace }: { inWorkspace: boolean }) {
  const prefs = usePrefs();
  const layout = usePrefs((s) => s.layout);
  const hasPose = useSession((s) => s.result?.pose != null);
  const hasBeats = useSession((s) => (s.result?.audio?.confidence ?? 0) >= 0.35);
  const cameras = useWebcam((s) => s.devices);
  const deviceId = useWebcam((s) => s.deviceId);

  return (
    <Popover
      label="View options"
      trigger={({ toggle, aria }) => (
        <IconButton label="View options" tone="plain" onClick={toggle} {...aria}>
          <Eye size={20} strokeWidth={1.9} />
        </IconButton>
      )}
    >
      <div className="popover__heading">Mirror</div>
      <ToggleRow
        title="Mirror my camera"
        hint="Flip the camera horizontally, like a real mirror."
        checked={prefs.mirrorCamera}
        onChange={(v) => prefs.set('mirrorCamera', v)}
      />
      {inWorkspace && (
        <div className="setting setting--stack">
          <div className="setting__text">
            <div className="setting__title">Camera framing</div>
            <div className="setting__hint">Match the choreography’s frame, or show everything the camera sees.</div>
          </div>
          <SegmentedControl<'match' | 'full'>
            block
            label="Camera framing"
            value={prefs.mirrorFit}
            onChange={(v) => prefs.set('mirrorFit', v)}
            options={[
              { value: 'match', label: 'Match video' },
              { value: 'full', label: 'Full camera' },
            ]}
          />
        </div>
      )}
      {cameras.length > 1 && (
        <div className="setting">
          <div className="setting__title">Camera</div>
          <select
            className="select"
            aria-label="Camera"
            value={deviceId ?? ''}
            onChange={(event) => selectCamera(event.target.value)}
          >
            {cameras.map((camera, i) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {inWorkspace && (
        <>
          <div className="popover__heading">Choreography</div>
          <ToggleRow
            title="Flip the video"
            hint="Mirror the choreography so its left and right match yours."
            checked={prefs.flipVideo}
            onChange={(v) => prefs.set('flipVideo', v)}
          />
          <ToggleRow
            title="Show skeleton"
            hint={hasPose ? 'Draw the tracked dancer over the video.' : 'Available once a dancer has been tracked.'}
            checked={prefs.showSkeleton && hasPose}
            disabled={!hasPose}
            onChange={(v) => prefs.set('showSkeleton', v)}
          />
          <ToggleRow
            title="Show beats"
            hint={hasBeats ? 'Tick marks on the timeline.' : 'Available when the music has a clear beat.'}
            checked={prefs.showBeats && hasBeats}
            disabled={!hasBeats}
            onChange={(v) => prefs.set('showBeats', v)}
          />
          {layout === 'overlay' && (
            <div className="setting setting--stack">
              <div className="setting__title">Choreography opacity</div>
              <Slider
                label="Choreography opacity"
                min={0.1}
                max={1}
                step={0.05}
                value={prefs.overlayOpacity}
                valueText={`${Math.round(prefs.overlayOpacity * 100)} percent`}
                onChange={(v) => prefs.set('overlayOpacity', v)}
              />
            </div>
          )}
          <div className="popover__heading">Appearance</div>
          <ToggleRow
            title="Ambient glow"
            hint="Tint the interface with the video’s colours."
            checked={prefs.ambient}
            onChange={(v) => prefs.set('ambient', v)}
          />
        </>
      )}
    </Popover>
  );
}
