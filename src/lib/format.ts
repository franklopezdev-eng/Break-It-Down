/**
 * Formats a media time the way players do: m:ss, m:ss.s, or h:mm:ss for long
 * videos. Truncates rather than rounds, so the display never runs ahead of the video.
 *
 * At sub-second precision, values within a hair of the next tick count as that tick:
 * a beat-snapped moment at 7.7999 s should read 7.8, not 7.7.
 */
export function formatTime(seconds: number, decimals: 0 | 1 | 2 = 0): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const factor = 10 ** decimals;
  const tolerance = decimals === 0 ? 1e-6 : Math.min(0.01, 0.1 / factor);
  const floored = Math.floor((safe + tolerance) * factor) / factor;

  const hours = Math.floor(floored / 3600);
  const minutes = Math.floor((floored % 3600) / 60);
  const secs = floored % 60;

  const secPart =
    decimals > 0 ? secs.toFixed(decimals).padStart(decimals + 3, '0') : String(Math.floor(secs)).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secPart}` : `${minutes}:${secPart}`;
}

/** 0.75 → "0.75×", 1 → "1×". */
export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
