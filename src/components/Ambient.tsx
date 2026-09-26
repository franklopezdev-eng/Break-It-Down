import { useEffect, useRef } from 'react';
import { player } from '../state/player';
import { usePrefs } from '../state/prefs';
import { useSession } from '../state/session';

/**
 * A blurred, oversaturated copy of the current video frame behind the interface —
 * the "ambient" glow used by Apple TV and Music — so the glass panels pick up the
 * colours of the choreography. Drawn at 32×18 pixels a few times a second, so it
 * costs almost nothing.
 */
export function Ambient() {
  const enabled = usePrefs((s) => s.ambient);
  const hasVideo = useSession((s) => s.video !== null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled || !hasVideo) return;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const video = player.element;
      if (video && video.readyState >= 2) ctx.drawImage(video, 0, 0, 32, 18);
    };
    draw();
    const id = window.setInterval(draw, 160);
    return () => window.clearInterval(id);
  }, [enabled, hasVideo]);

  return (
    <div className="ambient" aria-hidden="true" data-on={enabled && hasVideo}>
      <canvas ref={canvas} width={32} height={18} />
    </div>
  );
}
