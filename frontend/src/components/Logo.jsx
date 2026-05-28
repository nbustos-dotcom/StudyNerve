export default function Logo({ size = 24, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      {/* Radiating arms at 120° intervals, top / lower-right / lower-left */}
      <line x1="12" y1="12" x2="12"   y2="5.5"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55" />
      <line x1="12" y1="12" x2="17.6" y2="15.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55" />
      <line x1="12" y1="12" x2="6.4"  y2="15.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55" />
      {/* Terminal dots */}
      <circle cx="12"   cy="5.5"  r="1.5" opacity="0.75" />
      <circle cx="17.6" cy="15.3" r="1.5" opacity="0.75" />
      <circle cx="6.4"  cy="15.3" r="1.5" opacity="0.75" />
      {/* Central nerve node */}
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
