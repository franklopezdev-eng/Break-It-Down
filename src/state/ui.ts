import { create } from 'zustand';

interface UIState {
  shortcutsOpen: boolean;
  /** A file is being dragged over the window. */
  dragging: boolean;
  fullscreen: boolean;
  /** Using the mirror on its own, before any video has been chosen. */
  mirrorOnly: boolean;
}

export const useUI = create<UIState>(() => ({
  shortcutsOpen: false,
  dragging: false,
  fullscreen: false,
  mirrorOnly: false,
}));

export function setShortcutsOpen(open: boolean) {
  useUI.setState({ shortcutsOpen: open });
}

export function setMirrorOnly(mirrorOnly: boolean) {
  useUI.setState({ mirrorOnly });
}

export function toggleFullscreen() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}

document.addEventListener('fullscreenchange', () => {
  useUI.setState({ fullscreen: Boolean(document.fullscreenElement) });
});
