import type { KeyPointKind } from '../analysis/types';

export type MomentKind = KeyPointKind | 'start';

export const KIND_LABEL: Record<MomentKind, string> = {
  start: 'Start',
  hit: 'Hit',
  hold: 'Freeze',
  peak: 'Big move',
  section: 'New section',
  manual: 'Marker',
};

export const KIND_HINT: Record<MomentKind, string> = {
  start: 'The beginning of the video',
  hit: 'A sharp stop or accent',
  hold: 'The dancer freezes in a pose',
  peak: 'The most explosive part of a move',
  section: 'The movement changes character here',
  manual: 'Added by you',
};
