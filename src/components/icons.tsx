/**
 * Filled transport glyphs drawn to match SF Symbols' play.fill / pause.fill /
 * backward.end.fill / forward.end.fill. Everything else comes from lucide-react.
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Glyph({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const PlayFill = (props: IconProps) => (
  <Glyph {...props}>
    <path d="M7.2 5.1v13.8c0 1.05 1.15 1.68 2.04 1.12l10.9-6.9a1.32 1.32 0 0 0 0-2.24L9.24 3.98C8.35 3.42 7.2 4.05 7.2 5.1z" />
  </Glyph>
);

export const PauseFill = (props: IconProps) => (
  <Glyph {...props}>
    <rect x="5.6" y="4.2" width="4.6" height="15.6" rx="1.5" />
    <rect x="13.8" y="4.2" width="4.6" height="15.6" rx="1.5" />
  </Glyph>
);

export const SkipBackFill = (props: IconProps) => (
  <Glyph {...props}>
    <rect x="4.2" y="5" width="2.8" height="14" rx="1.3" />
    <path d="M19.7 6.3v11.4c0 .95-1.05 1.5-1.83.98l-8.5-5.7a1.18 1.18 0 0 1 0-1.96l8.5-5.7c.78-.52 1.83.03 1.83.98z" />
  </Glyph>
);

export const SkipForwardFill = (props: IconProps) => (
  <Glyph {...props}>
    <rect x="17" y="5" width="2.8" height="14" rx="1.3" />
    <path d="M4.3 6.3v11.4c0 .95 1.05 1.5 1.83.98l8.5-5.7a1.18 1.18 0 0 0 0-1.96l-8.5-5.7c-.78-.52-1.83.03-1.83.98z" />
  </Glyph>
);

/** The app icon: a waveform on the brand gradient. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="8" y1="0" x2="56" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff5c8a" />
          <stop offset="0.55" stopColor="#b44dff" />
          <stop offset="1" stopColor="#4f5bff" />
        </linearGradient>
        <linearGradient id="logo-gloss" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#logo-bg)" />
      <rect width="64" height="64" rx="15" fill="url(#logo-gloss)" />
      <g fill="#fff">
        <rect x="12" y="27" width="5" height="12" rx="2.5" opacity="0.7" />
        <rect x="21" y="19" width="5" height="28" rx="2.5" opacity="0.85" />
        <rect x="30" y="24" width="5" height="18" rx="2.5" />
        <rect x="39" y="14" width="5" height="36" rx="2.5" opacity="0.85" />
        <rect x="48" y="25" width="5" height="14" rx="2.5" opacity="0.7" />
      </g>
    </svg>
  );
}
