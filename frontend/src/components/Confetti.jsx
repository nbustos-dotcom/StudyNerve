import { useEffect, useState } from 'react'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#3b82f6', '#f43f5e', '#a78bfa',
]

function rand(min, max) {
  return min + Math.random() * (max - min)
}

function makePiece(i) {
  return {
    id: i,
    x: rand(5, 95),
    size: rand(6, 12),
    color: COLORS[i % COLORS.length],
    delay: rand(0, 0.6),
    rotation: rand(-45, 45),
    drift: rand(-60, 60),
  }
}

export default function Confetti({ show, count = 28 }) {
  const [pieces, setPieces] = useState([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!show) return
    setPieces(Array.from({ length: count }, (_, i) => makePiece(i)))
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 2400)
    return () => clearTimeout(t)
  }, [show, count])

  if (!visible || pieces.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10000,
        overflow: 'hidden',
      }}
    >
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: -20,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall 2s ease-in ${p.delay}s forwards`,
            '--drift': `${p.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
