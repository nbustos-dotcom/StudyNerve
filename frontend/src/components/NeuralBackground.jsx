/**
 * NeuralBackground — minimal test build.
 * One 200px orb, top-right corner, 3% opacity.
 * Confirm dark screen + faint glow before adding more.
 */
export default function NeuralBackground() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Single test orb — top-right, 200px, purple, 3% */}
      <div style={{
        position: 'absolute',
        top: '-50px',
        right: '-50px',
        width: '200px',
        height: '200px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.03) 0%, transparent 70%)',
      }} />
    </div>
  )
}
