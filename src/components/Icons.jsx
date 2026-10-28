// Flat line icons (no emoji). Inherit currentColor; size via the `size` prop.
import React from "react";

const base = (size) => ({ width: size, height: size, display: "block", flexShrink: 0 });
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export function TvIcon({ size = 28, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <rect x="2.5" y="4.5" width="19" height="12.5" rx="2" {...P} />
      <path d="M8 20.5h8M12 17v3.5" {...P} />
    </svg>
  );
}

export function PhoneIcon({ size = 16, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" {...P} />
      <path d="M10.5 18.5h3" {...P} />
    </svg>
  );
}

export function AlertIcon({ size = 16, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" {...P} />
      <path d="M12 9.5v4.5M12 16.8v.2" {...P} />
    </svg>
  );
}

export function PlayIcon({ size = 14, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <path d="M7 4.5v15l12-7.5L7 4.5Z" fill="currentColor" />
    </svg>
  );
}

export function ChevronIcon({ size = 14, open = false, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} aria-hidden="true" {...rest}>
      <path d="m6 9 6 6 6-6" {...P} />
    </svg>
  );
}

export function ExpandIcon({ size = 14, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...P} />
    </svg>
  );
}

export function CloseIcon({ size = 18, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <path d="m6 6 12 12M18 6 6 18" {...P} />
    </svg>
  );
}

export function CameraIcon({ size = 22, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" {...P} />
      <circle cx="12" cy="13.5" r="3.2" {...P} />
    </svg>
  );
}

export function VideoIcon({ size = 22, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <rect x="3" y="6.5" width="12.5" height="11" rx="2" {...P} />
      <path d="m15.5 10.5 5-3v9l-5-3" {...P} />
    </svg>
  );
}

export function UploadIcon({ size = 22, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" {...P} />
    </svg>
  );
}

export function ScreenIcon({ size = 22, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <rect x="3" y="5" width="18" height="12" rx="1.5" {...P} />
      <path d="M9 20h6" {...P} />
      <path d="m8.5 13 2.5-3 2 2.5 1.5-1.5 2 2" {...P} />
    </svg>
  );
}

export function PrintIcon({ size = 14, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" style={base(size)} aria-hidden="true" {...rest}>
      <path d="M7 8V3.5h10V8M7 17H4.5v-6a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v6H17" {...P} />
      <rect x="7" y="14" width="10" height="6.5" rx="1" {...P} />
    </svg>
  );
}
