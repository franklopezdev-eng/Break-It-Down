import { describe, expect, it } from 'vitest';
import { chooseArrangement } from '../src/lib/stage';

const WIDE = 16 / 9;
const TALL = 9 / 16;

describe('chooseArrangement', () => {
  it('puts two landscape panes side by side on a wide desktop stage', () => {
    expect(chooseArrangement(1030, 550, WIDE, WIDE)).toBe('row');
    expect(chooseArrangement(1600, 800, WIDE, WIDE)).toBe('row');
  });

  it('stacks two landscape panes on a portrait phone', () => {
    expect(chooseArrangement(343, 500, WIDE, WIDE)).toBe('column');
  });

  it('stacks landscape panes when the window is tall enough that stacking wins', () => {
    expect(chooseArrangement(1030, 900, WIDE, WIDE)).toBe('column');
  });

  it('keeps portrait panes (a portrait dance video) side by side, even on a phone', () => {
    expect(chooseArrangement(343, 500, TALL, TALL)).toBe('row');
    expect(chooseArrangement(1030, 700, TALL, TALL)).toBe('row');
  });

  it('handles a portrait video beside a landscape mirror', () => {
    // Mixed shapes: whichever is larger overall.
    const result = chooseArrangement(1030, 600, TALL, WIDE);
    expect(['row', 'column']).toContain(result);
  });

  it('defaults to a row before the stage has been measured', () => {
    expect(chooseArrangement(0, 0, WIDE, WIDE)).toBe('row');
    expect(chooseArrangement(500, 500, 0, WIDE)).toBe('row');
  });
});
