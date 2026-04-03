/**
 * NeuralBackground
 * CSS-only animated backdrop: floating nodes, faint connecting lines, and a
 * third radial-gradient orb. Sits at z-index -1 behind all page content.
 * No JS animation — every motion is driven by CSS keyframes via inline styles.
 */

const NODES = [
  // { x, y, size(px), color, anim, dur, delay, glow-spread }
  { id: 1,  x: '8%',  y: '12%', size: 3, color: '#6366f1', anim: 'float-a', dur: '18s', delay: '0s',    glow: 6  },
  { id: 2,  x: '22%', y: '46%', size: 5, color: '#818cf8', anim: 'float-c', dur: '23s', delay: '-5s',   glow: 10 },
  { id: 3,  x: '38%', y: '17%', size: 3, color: '#a78bfa', anim: 'float-b', dur: '20s', delay: '-8s',   glow: 7  },
  { id: 4,  x: '55%', y: '34%', size: 6, color: '#6366f1', anim: 'float-e', dur: '26s', delay: '-3s',   glow: 12 },
  { id: 5,  x: '72%', y: '8%',  size: 3, color: '#818cf8', anim: 'float-d', dur: '17s', delay: '-12s',  glow: 6  },
  { id: 6,  x: '85%', y: '56%', size: 4, color: '#a78bfa', anim: 'float-a', dur: '29s', delay: '-7s',   glow: 8  },
  { id: 7,  x: '15%', y: '73%', size: 3, color: '#6366f1', anim: 'float-b', dur: '21s', delay: '-15s',  glow: 6  },
  { id: 8,  x: '48%', y: '69%', size: 5, color: '#818cf8', anim: 'float-d', dur: '24s', delay: '-4s',   glow: 10 },
  { id: 9,  x: '65%', y: '83%', size: 3, color: '#a78bfa', anim: 'float-c', dur: '19s', delay: '-10s',  glow: 6  },
  { id: 10, x: '90%', y: '29%', size: 4, color: '#6366f1', anim: 'float-e', dur: '27s', delay: '-6s',   glow: 8  },
]

/**
 * Lines are defined as { x, y, angleDeg, widthVw, delay, dur }.
 * Positions are the start point; angle/width aim roughly toward the target node.
 * Opacity is kept very low and breathes slowly so lines feel ambient, not clinical.
 *
 * Pairs and approximate math (viewport %):
 *   1(8,12)→3(38,17): dx=30, dy=5  → angle≈9°,  width≈30.4vw
 *   3(38,17)→4(55,34): dx=17, dy=17 → angle=45°, width≈24vw
 *   4(55,34)→6(85,56): dx=30, dy=22 → angle≈36°, width≈37vw
 *   2(22,46)→8(48,69): dx=26, dy=23 → angle≈41°, width≈35vw
 *   7(15,73)→8(48,69): dx=33, dy=-4 → angle≈-7°, width≈33vw
 *   8(48,69)→9(65,83): dx=17, dy=14 → angle≈39°, width≈22vw
 *   5(72,8)→10(90,29): dx=18, dy=21 → angle≈49°, width≈28vw
 */
const LINES = [
  { id: 1,  x: '8%',  y: '12%', angle:  9,  width: '30.4vw', dur: '22s', delay: '-2s'  },
  { id: 2,  x: '38%', y: '17%', angle: 45,  width: '24vw',   dur: '28s', delay: '-9s'  },
  { id: 3,  x: '55%', y: '34%', angle: 36,  width: '37vw',   dur: '35s', delay: '-5s'  },
  { id: 4,  x: '22%', y: '46%', angle: 41,  width: '35vw',   dur: '25s', delay: '-14s' },
  { id: 5,  x: '15%', y: '73%', angle: -7,  width: '33vw',   dur: '30s', delay: '-3s'  },
  { id: 6,  x: '48%', y: '69%', angle: 39,  width: '22vw',   dur: '20s', delay: '-11s' },
  { id: 7,  x: '72%', y: '8%',  angle: 49,  width: '28vw',   dur: '33s', delay: '-7s'  },
]

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
      {/* Third centered orb for mid-screen depth */}
      <div
        style={{
          position: 'absolute',
          top: '42%',
          left: '50%',
          width: '48vw',
          height: '48vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.045) 0%, rgba(139,92,246,0.02) 45%, transparent 70%)',
          animation: 'orb-drift-c 36s ease-in-out infinite alternate',
          willChange: 'transform',
        }}
      />

      {/* Connecting lines */}
      {LINES.map((line) => (
        <div
          key={line.id}
          style={{
            position: 'absolute',
            left: line.x,
            top: line.y,
            width: line.width,
            height: '1px',
            background: 'linear-gradient(to right, transparent, rgba(129,140,248,0.065), transparent)',
            transformOrigin: 'left center',
            transform: `rotate(${line.angle}deg)`,
            animation: `line-breathe ${line.dur} ease-in-out ${line.delay} infinite`,
            willChange: 'opacity',
          }}
        />
      ))}

      {/* Floating nodes */}
      {NODES.map((node) => (
        <div
          key={node.id}
          style={{
            position: 'absolute',
            left: node.x,
            top: node.y,
            width: node.size,
            height: node.size,
            borderRadius: '50%',
            background: node.color,
            boxShadow: `0 0 ${node.glow}px ${node.glow / 2}px ${node.color}55`,
            opacity: 0.55,
            animation: `${node.anim} ${node.dur} ease-in-out ${node.delay} infinite`,
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  )
}
