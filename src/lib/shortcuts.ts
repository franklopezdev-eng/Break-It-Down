export interface Shortcut {
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/** The single source of truth for the shortcuts sheet (the handlers live in useShortcuts). */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Playback',
    items: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['←', '→'], label: 'Previous / next key moment' },
      { keys: ['⇧', '←'], label: 'Back 1 second' },
      { keys: ['⇧', '→'], label: 'Forward 1 second' },
      { keys: [',', '.'], label: 'Step one frame back / forward' },
    ],
  },
  {
    title: 'Practice',
    items: [
      { keys: ['L'], label: 'Loop the current section' },
      { keys: ['['], label: 'Slower' },
      { keys: [']'], label: 'Faster' },
      { keys: ['1', '2', '3', '4'], label: 'Speed 0.25× · 0.5× · 0.75× · 1×' },
      { keys: ['A'], label: 'Add a key moment at the playhead' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: ['C'], label: 'Camera on / off' },
      { keys: ['V'], label: 'Cycle layout' },
      { keys: ['H'], label: 'Flip the choreography video' },
      { keys: ['S'], label: 'Show / hide skeleton' },
      { keys: ['M'], label: 'Mute / unmute' },
      { keys: ['F'], label: 'Full screen' },
      { keys: ['?'], label: 'Show this list' },
    ],
  },
];
