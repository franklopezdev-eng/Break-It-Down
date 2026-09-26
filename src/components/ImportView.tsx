import { Camera, Lock, Repeat, Sparkles, Upload } from 'lucide-react';
import { useSession } from '../state/session';
import { setMirrorOnly } from '../state/ui';
import { startWebcam } from '../state/webcam';
import { pickVideo } from './FileInput';
import { LogoMark } from './icons';

const FEATURES = [
  {
    icon: <Sparkles size={22} strokeWidth={1.9} />,
    tint: 'pink',
    title: 'Finds the key moments',
    body: 'On-device pose tracking and beat detection mark every hit, freeze and change of direction.',
  },
  {
    icon: <Repeat size={22} strokeWidth={1.9} />,
    tint: 'blue',
    title: 'Loop at any speed',
    body: 'Repeat any section from 0.25× to 2× with a run-up, and let it advance when you’re ready.',
  },
  {
    icon: <Camera size={22} strokeWidth={1.9} />,
    tint: 'green',
    title: 'See yourself',
    body: 'A live mirror beside — or right under — the choreography, so you can match every pose.',
  },
] as const;

export function ImportView() {
  const opening = useSession((s) => s.opening);

  return (
    <div className="import">
      <div className="import__hero">
        <LogoMark size={92} className="import__mark" />
        <h1 className="t-large-title import__title">Break It Down</h1>
        <p className="t-title3 import__subtitle t-secondary">
          Learn choreography one moment at a time.
        </p>

        <div className="import__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={pickVideo} disabled={opening}>
            {opening ? <span className="spinner spinner--on-accent" /> : <Upload size={20} strokeWidth={2.2} />}
            {opening ? 'Opening…' : 'Choose Video'}
          </button>
          <button
            type="button"
            className="btn btn--tinted btn--lg"
            onClick={() => {
              setMirrorOnly(true);
              void startWebcam();
            }}
          >
            <Camera size={20} strokeWidth={2.2} />
            Open Mirror
          </button>
        </div>

        <p className="t-footnote t-tertiary import__drop">or drop a video anywhere on this page · MP4, MOV or WebM</p>
      </div>

      <ul className="import__features" aria-label="What it does">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="feature glass" data-tint={feature.tint}>
            <span className="feature__icon">{feature.icon}</span>
            <h2 className="t-headline">{feature.title}</h2>
            <p className="t-subhead t-secondary">{feature.body}</p>
          </li>
        ))}
      </ul>

      <p className="import__privacy t-footnote t-secondary">
        <Lock size={13} strokeWidth={2.4} aria-hidden="true" />
        <span>Your video and camera never leave this device.</span>
      </p>
    </div>
  );
}
