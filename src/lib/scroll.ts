/**
 * Where a scroll box should scroll to so that an item is fully in view, moving as
 * little as possible. All the rectangle edges must be in the same coordinate space
 * (viewport coordinates from getBoundingClientRect work).
 *
 * Unlike `element.scrollIntoView`, this only ever moves the one scroll box you give it
 * to. `scrollIntoView` also scrolls every ancestor, including the page, which yanks the
 * window around when the box lives lower down the page.
 *
 * Returns the current `scrollTop` when the item is already visible. An item taller than
 * the box is aligned to its top edge.
 */
export function scrollTopToReveal(
  scrollTop: number,
  viewTop: number,
  viewBottom: number,
  itemTop: number,
  itemBottom: number,
  padding = 8,
): number {
  const overTop = itemTop - (viewTop + padding);
  const overBottom = itemBottom - (viewBottom - padding);
  const tooTall = itemBottom - itemTop > viewBottom - viewTop - padding * 2;

  if (overTop < 0 || tooTall) return Math.max(0, scrollTop + overTop);
  if (overBottom > 0) return Math.max(0, scrollTop + overBottom);
  return scrollTop;
}
