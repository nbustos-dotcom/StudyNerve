import { useEffect, useState } from 'react'
import { subscribeWarming } from '../api/client'

// Top-of-viewport pill that appears when any in-flight API request has been
// pending for more than ~3s, and clears when all pending requests complete.
// Bridges the Render free-tier cold-start gap: instead of a silent dead-looking
// skeleton for 30–60s, the user gets an explanation.
//
// Sits at z-index 9998 (just below the toast layer at 9999) so toasts can
// still stack over it if anything else fires during the warm-up.
export default function WarmingBanner() {
  const [warming, setWarming] = useState(false)

  useEffect(() => subscribeWarming(setWarming), [])

  if (!warming) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        background: 'rgba(99, 102, 241, 0.14)',
        borderBottom: '1px solid rgba(99, 102, 241, 0.28)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '8px 16px',
        fontSize: 12.5,
        color: 'rgba(196, 205, 253, 0.95)',
        animation: 'warming-slide-down 0.25s ease',
        pointerEvents: 'none',
      }}
    >
      <svg
        className="animate-spin"
        width="13"
        height="13"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ color: 'rgba(165, 180, 252, 0.9)' }}
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" opacity="0.75" />
      </svg>
      <span>Warming up the server — this can take ~30 seconds the first time.</span>
      <style>{`
        @keyframes warming-slide-down {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>
    </div>
  )
}
