// Lightweight Lucide-style line icons (no dependency). Consistent 1.75 stroke,
// 24x24 viewBox, currentColor — size with text/width utilities, color with text-*.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ArrowUp(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Base>
  );
}

export function ArrowDown(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </Base>
  );
}

export function TrendUp(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </Base>
  );
}

export function Lock(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </Base>
  );
}

export function Trophy(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M12 13v4M9 21h6M10 17h4" />
    </Base>
  );
}

export function Coins(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v5c0 1.66 2.69 3 6 3s6-1.34 6-3V7" />
      <path d="M9 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
      <path d="M15 9.5c2.5.3 6 1.4 6 3.5" />
    </Base>
  );
}

export function Check(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Base>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  );
}

export function ArrowLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Base>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </Base>
  );
}

export function Download(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </Base>
  );
}

export function Users(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 4.13A4 4 0 0 1 16 11.87" />
    </Base>
  );
}

export function Sparkle(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </Base>
  );
}

export function Flag(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </Base>
  );
}

export function Sliders(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M2 14h4M10 8h4M18 16h4" />
    </Base>
  );
}

export function Monitor(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Base>
  );
}

export function Maximize(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
    </Base>
  );
}

export function X(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Base>
  );
}

export function Shuffle(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M18 4l3 3-3 3" />
      <path d="M18 20l3-3-3-3" />
      <path d="M3 7h3.5c1.5 0 2.8.8 3.5 2l4 6c.7 1.2 2 2 3.5 2H21" />
      <path d="M3 17h3.5c1.5 0 2.8-.8 3.5-2M21 7h-3.5c-1.2 0-2.3.5-3 1.4" />
    </Base>
  );
}

export function Bot(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M12 8V4M9 4h6" />
      <circle cx="9" cy="13" r="0.5" />
      <circle cx="15" cy="13" r="0.5" />
    </Base>
  );
}

export function Clover(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 12c0-2-1-4-3-4a3 3 0 0 0 0 6c2 0 3-2 3-2Z" />
      <path d="M12 12c0-2 1-4 3-4a3 3 0 0 1 0 6c-2 0-3-2-3-2Z" />
      <path d="M12 12c-2 0-4 1-4 3a3 3 0 0 0 6 0c0-2-2-3-2-3Z" />
      <path d="M12 12c2 0 4 1 4 3a3 3 0 0 1-6 0c0-2 2-3 2-3Z" />
    </Base>
  );
}

export function Mail(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7.5 7.3 5.2a2 2 0 0 0 2.4 0l7.3-5.2" />
    </Base>
  );
}

export function Github(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M15 22v-3.6a3 3 0 0 0-.9-2.4c2.9-.3 5.9-1.4 5.9-6.2a4.8 4.8 0 0 0-1.3-3.3 4.5 4.5 0 0 0-.1-3.4s-1.1-.3-3.6 1.3a12.1 12.1 0 0 0-6 0C6.5 2.8 5.4 3.1 5.4 3.1a4.5 4.5 0 0 0-.1 3.4A4.8 4.8 0 0 0 4 9.8c0 4.8 3 5.9 5.9 6.2a3 3 0 0 0-.9 2.4V22" />
      <path d="M9 18.5c-3 1-3.5-1.5-5-2" />
    </Base>
  );
}

export function Globe(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
    </Base>
  );
}

export function User(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Base>
  );
}

export function Key(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8" cy="15" r="3.5" />
      <path d="m10.6 12.6 7.2-7.2M15.5 7.7l2 2M18 5.2l2 2" />
    </Base>
  );
}

export function LogOut(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" />
      <path d="m17 15 3-3-3-3M20 12H10" />
    </Base>
  );
}

export function Trash(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7 7 19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l.5-12" />
      <path d="M10.5 11v6M13.5 11v6" />
    </Base>
  );
}

/**
 * The Google "G". The only icon here that is not a monochrome line mark: brand
 * marks have to keep their own colours, so this one opts out of `Base` and
 * ignores currentColor by design.
 */
export function GoogleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" width="1em" height="1em" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.6 5.1.4.1c4.2-3.9 6.6-9.6 6.6-15.8Z"
      />
      <path
        fill="#34A853"
        d="M24 46c6 0 11-2 14.6-5.3l-7-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.02-6.9 5.3-.1.3C7.8 41 15.3 46 24 46Z"
      />
      <path
        fill="#FBBC05"
        d="M11.5 28.4a13.6 13.6 0 0 1 0-8.8l-.01-.3-7-5.4-.2.1a22 22 0 0 0 0 19.8l7.2-5.4Z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.2 30 1 24 1 15.3 1 7.8 6 4.2 13.9l7.2 5.6C13.3 14.2 18.2 9.5 24 9.5Z"
      />
    </svg>
  );
}
