import { describe, expect, it } from 'vitest';
import { scrollTopToReveal } from '../src/lib/scroll';

// A scroll box whose visible window spans y = 200…500 on screen, currently scrolled 100px.
const TOP = 200;
const BOTTOM = 500;
const SCROLLED = 100;

describe('scrollTopToReveal', () => {
  it('leaves the scroll alone when the item is already fully visible', () => {
    expect(scrollTopToReveal(SCROLLED, TOP, BOTTOM, 260, 320)).toBe(SCROLLED);
  });

  it('scrolls down just far enough to reveal an item below the window', () => {
    // The item ends at 620; the window (less 8px padding) ends at 492 → 128px more.
    expect(scrollTopToReveal(SCROLLED, TOP, BOTTOM, 560, 620)).toBe(SCROLLED + 128);
  });

  it('scrolls up just far enough to reveal an item above the window', () => {
    // The item starts at 120; the window (plus 8px padding) starts at 208 → 88px back.
    expect(scrollTopToReveal(SCROLLED, TOP, BOTTOM, 120, 180)).toBe(SCROLLED - 88);
  });

  it('fixes an item that is only partly cut off', () => {
    expect(scrollTopToReveal(SCROLLED, TOP, BOTTOM, 450, 510)).toBe(SCROLLED + 18);
    expect(scrollTopToReveal(SCROLLED, TOP, BOTTOM, 190, 250)).toBe(SCROLLED - 18);
  });

  it('never asks to scroll above the start of the list', () => {
    expect(scrollTopToReveal(20, TOP, BOTTOM, 0, 60)).toBe(0);
  });

  it('aligns the top of an item taller than the window instead of jumping past it', () => {
    expect(scrollTopToReveal(SCROLLED, TOP, BOTTOM, 300, 900)).toBe(SCROLLED + (300 - 208));
  });

  it('respects a custom padding', () => {
    expect(scrollTopToReveal(SCROLLED, TOP, BOTTOM, 205, 265, 0)).toBe(SCROLLED);
    expect(scrollTopToReveal(SCROLLED, TOP, BOTTOM, 205, 265, 20)).toBe(SCROLLED - 15);
  });
});
