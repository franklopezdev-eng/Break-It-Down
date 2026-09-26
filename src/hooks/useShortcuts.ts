import { useEffect } from 'react';
import { player, usePlayer } from '../state/player';
import { RATE_PRESETS, RATE_STEP, usePrefs, type Layout } from '../state/prefs';
import { addKeyPoint, useSession } from '../state/session';
import { setShortcutsOpen, toggleFullscreen, useUI } from '../state/ui';
import { toggleWebcam } from '../state/webcam';

const LAYOUTS: Layout[] = ['video', 'split', 'overlay', 'mirror'];

/** Elements that use the keys we care about for themselves. */
const TEXT_ENTRY = 'input:not([type="range"]):not([type="checkbox"]), textarea, select, [contenteditable="true"]';
/** Elements where arrow keys mean something else (moving a value or a selection). */
const ARROW_OWNERS = 'input[type="range"], [role="slider"], [role="radio"]';
/** Elements that activate on Space themselves. */
const SPACE_OWNERS = 'button, a[href], [role="switch"], [role="radio"], [role="slider"], input[type="range"]';

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT_ENTRY)) return;

      const prefs = usePrefs.getState();
      const hasVideo = useSession.getState().video !== null;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      let handled = true;

      switch (key) {
        case '?':
          setShortcutsOpen(!useUI.getState().shortcutsOpen);
          break;
        case 'c':
          // Never start the camera from a screen that has no camera UI (the import screen).
          if (hasVideo || useUI.getState().mirrorOnly) toggleWebcam();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          if (hasVideo) player.toggleMute();
          break;
        case 'v':
          if (hasVideo) prefs.set('layout', LAYOUTS[(LAYOUTS.indexOf(prefs.layout) + 1) % LAYOUTS.length]);
          break;
        case 'h':
          if (hasVideo) prefs.set('flipVideo', !prefs.flipVideo);
          break;
        case 's':
          if (hasVideo) prefs.set('showSkeleton', !prefs.showSkeleton);
          break;
        case ' ':
          if (!hasVideo || target?.closest(SPACE_OWNERS)) return;
          player.toggle();
          break;
        case 'k':
          if (hasVideo) player.toggle();
          break;
        case 'l':
          if (hasVideo) player.toggleLoop();
          break;
        case 'a':
          if (hasVideo) addKeyPoint(usePlayer.getState().time);
          break;
        case ',':
        case '<':
          if (hasVideo) player.step(-1);
          break;
        case '.':
        case '>':
          if (hasVideo) player.step(1);
          break;
        case '[':
          if (hasVideo) player.setRate(prefs.rate - RATE_STEP);
          break;
        case ']':
          if (hasVideo) player.setRate(prefs.rate + RATE_STEP);
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          if (hasVideo) player.setRate(RATE_PRESETS[Number(key) - 1]);
          break;
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!hasVideo || target?.closest(ARROW_OWNERS)) return;
          const direction = key === 'ArrowRight' ? 1 : -1;
          if (event.shiftKey) player.nudge(direction);
          else if (direction === 1) player.nextKeyPoint();
          else player.previousKeyPoint();
          break;
        }
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
