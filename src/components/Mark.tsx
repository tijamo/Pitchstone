/**
 * The Pitchstone mark, as a component.
 *
 * Kept in step with public/icon.svg by hand — the same three facets and the
 * same violet ramp. It is inline rather than an <img> so it inherits the
 * page's rendering and can be sized from CSS, and because the sign-in screen
 * should not wait on a second request to show the app's own name.
 */
export function Mark({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="Pitchstone"
    >
      <defs>
        <linearGradient id="mark-centre" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#c9befd" />
          <stop offset="1" stopColor="#8875f5" />
        </linearGradient>
        <linearGradient id="mark-right" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8875f5" />
          <stop offset="1" stopColor="#6c56e8" />
        </linearGradient>
        <linearGradient id="mark-left" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6c56e8" />
          <stop offset="1" stopColor="#4632ad" />
        </linearGradient>
      </defs>
      <path d="M256 67 115 210 190 445Z" fill="url(#mark-left)" />
      <path d="M256 67 190 445 322 445Z" fill="url(#mark-centre)" />
      <path d="M256 67 322 445 397 210Z" fill="url(#mark-right)" />
      <path d="M256 67 115 210 256 137Z" fill="#ffffff" opacity="0.18" />
    </svg>
  )
}
