/** Original outlined Om monogram. Same drawing as app/icon.svg. */
export function OmMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 128 128" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" aria-hidden="true" focusable="false">
    <circle cx="37" cy="64" r="24" />
    <path d="M74 87V55c0-8 5-13 11-13s11 5 11 13v32m0-32c0-8 5-13 11-13s11 5 11 13v32" />
  </svg>;
}
