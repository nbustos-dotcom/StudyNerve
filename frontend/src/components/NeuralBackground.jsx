import { useCallback, useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { api } from '../api/client'

const PLACEHOLDER = [
  { subject: 'Mathematics', count: 5 },
  { subject: 'Science', count: 4 },
  { subject: 'History', count: 3 },
  { subject: 'Literature', count: 4 },
  { subject: 'Computing', count: 6 },
  { subject: 'Chemistry', count: 3 },
]

function buildGraph(subjects) {
  const nodes = []
  const links = []

  subjects.forEach(({ subject, count }) => {
    nodes.push({ id: subject, group: subject, size: Math.min(count, 10) + 3 })
    const numTopics = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < numTopics; i++) {
      const tid = `${subject}_topic_${i}`
      nodes.push({ id: tid, group: subject, size: 2 + Math.random() * 2 })
      links.push({ source: subject, target: tid })
    }
  })

  const ids = subjects.map(s => s.subject)
  if (ids.length >= 2) {
    const numCross = 1 + Math.floor(Math.random() * 2)
    for (let k = 0; k < numCross; k++) {
      const a = ids[Math.floor(Math.random() * ids.length)]
      let b = ids[Math.floor(Math.random() * ids.length)]
      let tries = 0
      while (b === a && tries++ < 10) b = ids[Math.floor(Math.random() * ids.length)]
      if (a !== b) links.push({ source: a, target: b })
    }
  }

  return { nodes, links }
}

export default function NeuralBackground() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    console.log('Neural background mounted')
    api.getSubjects()
      .then(subjects => {
        const active = (subjects || []).filter(s => !s.archived)
        setGraphData(buildGraph(active.length > 0 ? active : PLACEHOLDER))
      })
      .catch(() => setGraphData(buildGraph(PLACEHOLDER)))
  }, [])

  useEffect(() => {
    const update = () => setDims({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const paintNode = useCallback((node, ctx) => {
    const r = Math.max(1, node.size || 3)
    const alpha = Math.min(0.25, Math.max(0.08, 0.08 + ((r - 2) / 11) * 0.17))
    ctx.beginPath()
    ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI)
    ctx.fillStyle = `rgba(99,102,241,${alpha.toFixed(3)})`
    ctx.fill()
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.25,
        overflow: 'hidden',
      }}
    >
      <ForceGraph2D
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeCanvasObject={paintNode}
        linkColor={() => 'rgba(99,102,241,0.04)'}
        linkWidth={0.5}
        nodeRelSize={1}
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.4}
        cooldownTime={Infinity}
        enableZoomInteraction={false}
        enablePanInteraction={false}
        enableNodeDrag={false}
        width={dims.w}
        height={dims.h}
      />
    </div>
  )
}
