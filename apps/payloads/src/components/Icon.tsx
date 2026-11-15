// Trusted inline SVG icons (24×24, stroke = currentColor). Fixed paths only; never built from data.
import type { ReactNode } from 'react';

const PATHS = {
  seismic: <path d="M2 12h3l2-6 3 12 3-9 2 5 2-2h5" />,
  camera: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7l1.5-3h5L16 7" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  spectrum: (
    <>
      <path d="M3 18L10 5l7 13z" />
      <path d="M13 11.5l8-3M13.8 13l7.2 0M13 14.5l8 3" />
    </>
  ),
  drill: (
    <>
      <path d="M12 2v4M8 6h8v4H8zM10 10h4l-1 4h-2zM11 14l1 8 1-8" />
      <path d="M3 18h5M16 18h5" />
    </>
  ),
  droplet: (
    <>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
      <path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  radiation: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4a8 8 0 0 1 6.9 4L14 10.8M5.1 8A8 8 0 0 1 12 4M5.1 8L10 10.8M18.9 16A8 8 0 0 1 5.1 16M10 13.2L5.1 16M14 13.2l4.9 2.8" />
    </>
  ),
  exosphere: (
    <>
      <circle cx="12" cy="14" r="5" />
      <path d="M4 9.5a10 10 0 0 1 16 0M2.5 6a13 13 0 0 1 19 0" />
    </>
  ),
  regolith: (
    <>
      <path d="M2 18h20M4 14h16M6 10h12" />
      <circle cx="7" cy="21" r=".6" />
      <circle cx="12" cy="21" r=".6" />
      <circle cx="17" cy="21" r=".6" />
      <circle cx="10" cy="6" r="1.5" />
      <circle cx="14.5" cy="6.5" r="1" />
    </>
  ),
  antenna: (
    <>
      <path d="M4.5 10.5a7.5 7.5 0 0 0 9 9z" />
      <path d="M9 15l6-6" />
      <circle cx="16" cy="8" r="1.2" />
      <path d="M15.5 3.5a5 5 0 0 1 5 5M15 6a2.5 2.5 0 0 1 3 3" />
      <path d="M6 21h6" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z" />
      <path d="M5 19L13 11" />
    </>
  ),
  isru: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
  telescope: (
    <>
      <path d="M3 11l13-5 2 5-13 5z" />
      <path d="M16 6l3-1 2 5-3 1" />
      <path d="M10 14l-3 7M11 14l3 7" />
    </>
  ),
  capsule: (
    <>
      <path d="M8 3h8v3H8z" />
      <path d="M7 6h10l-1 14a2 2 0 0 1-2 1h-4a2 2 0 0 1-2-1z" />
      <path d="M9 12h6" />
    </>
  ),
  robot: (
    <>
      <path d="M4 21h8M8 21v-4l5-6 4 2" />
      <circle cx="8" cy="17" r="1.2" />
      <circle cx="13" cy="11" r="1.2" />
      <path d="M17 13l3-3M17 13l3 2" />
    </>
  ),
  power: (
    <>
      <rect x="3" y="4" width="11" height="8" rx="1" />
      <path d="M6.5 4v8M10.5 4v8M3 8h11M8.5 12v4M5 20h7" />
      <path d="M18 9l-2 5h4l-2 5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  book: (
    <>
      <path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
      <path d="M20 4h-5a2 2 0 0 0-2 2" />
      <path d="M20 4v14h-7" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  external: (
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

const isIconName = (name: string): name is IconName => Object.prototype.hasOwnProperty.call(PATHS, name);

interface IconProps {
  /** Icon key. Category icons come from the data, so unknown names fall back to a target. */
  name: string;
  size?: number;
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 24, label, className = 'icon' }: IconProps) {
  const body = isIconName(name) ? PATHS[name] : PATHS.target;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {body}
    </svg>
  );
}
