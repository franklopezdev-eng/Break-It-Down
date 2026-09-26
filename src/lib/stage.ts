export type Arrangement = 'row' | 'column';

/**
 * Whether two panes with aspect ratios `a1` and `a2` show larger side by side or
 * stacked in a `width × height` stage. Two landscape panes fit a wide desktop stage
 * side by side but are tiny in a portrait phone or a tall window, where stacking
 * them uses far more of the space. Portrait panes (a portrait dance video) are the
 * reverse. Ties go to a row.
 */
export function chooseArrangement(width: number, height: number, a1: number, a2: number, gap = 16): Arrangement {
  if (width <= 0 || height <= 0 || a1 <= 0 || a2 <= 0) return 'row';

  const rowHeight = Math.min(height, (width - gap) / (a1 + a2));
  const rowArea = rowHeight * rowHeight * (a1 + a2);

  const eachHeight = (height - gap) / 2;
  const stacked = (aspect: number) => {
    const w = Math.min(width, eachHeight * aspect);
    return (w * w) / aspect;
  };
  const columnArea = stacked(a1) + stacked(a2);

  // A little hysteresis so the layout doesn't flip back and forth while resizing.
  return columnArea > rowArea * 1.08 ? 'column' : 'row';
}
