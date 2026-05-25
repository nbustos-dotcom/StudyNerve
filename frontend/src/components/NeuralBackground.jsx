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
    nodes.push({ id: subject, group: subject, isSubject: true, size: Math.min(count, 10) + 3 })
    const numTopics = 4 + Math.floor(Math.random() * 3) // 4–6 per subject
    for (let i = 0; i < numTopics; i++) {
      const tid = `${subject}_topic_${i}`
      nodes.push({ id: tid, group: subject, isSubject: false, size: 2 + (i % 3) * 0.5 })
      links.push({ source: subject, target: tid, cross: false })
    }
  })

  // Connect every adjacent pair of subjects with 1–2 cross-links
  const ids = subjects.map(s => s.subject)
  for (let i = 0; i < ids.length - 1; i++) {
    const n = 1 + Math.floor(Math.random() * 2)
    for (let k = 0; k < n; k++) {
      links.push({ source: ids[i], target: ids[i + 1], cross: true })
    }
  }
  // Close the ring if there are enough subjects
  if (ids.length >= 3) {
    links.push({ source: ids[ids.length - 1], target: ids[0], cross: true })
  }

  return { nodes, links }
}

export default function NeuralBackground() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })
  const graphRef = useRef()

  useEffect(() => {
    console.log('Neural background mounted')
    api.getSubjects()
      .then(subjects => {
        const active = (subjects || []).filter(s => !s.archived)
        setGraphData(buildGraph(active.length > 0 ? active : PLACEHOLDER))
      })
      .catch(() => setGraphData(buildGraph(PLACEHOLDER)))
  }, [])

  // Track full scroll height so the canvas covers the whole dashboard
  useEffect(() => {
    const update = () => {
      const h = Math.max(
        window.innerHeight,
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      )
      setDims({ w: window.innerWidth, h })
    }
    update()
    window.addEventListener('resize', update)
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
    return () => {
      window.removeEventListener('resize', update)
      ro.disconnect()
    }
  }, [])

  // Tune d3 forces once graph data is available
  useEffect(() => {
    if (!graphRef.current || graphData.nodes.length === 0) return
    graphRef.current.d3Force('charge').strength(-30)
    graphRef.current.d3Force('center').strength(0.05)
    graphRef.current.d3Force('link').distance(link => link.cross ? 120 : 40)
    graphRef.current.d3ReheatSimulation()
  }, [graphData])

  const paintNode = useCallback((node, ctx) => {
    if (node.isSubject) {
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, 5, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(99,102,241,0.30)'
      ctx.fill()
    } else {
      const r = Math.max(2, Math.min(3, node.size || 2))
      const alpha = 0.12 + (r - 2) * 0.06 // 0.12–0.18 deterministic
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI)
      ctx.fillStyle = `rgba(99,102,241,${alpha.toFixed(3)})`
      ctx.fill()
    }
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: dims.h,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.25,
        overflow: 'hidden',
      }}
    >
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeCanvasObject={paintNode}
        linkColor={link => link.cross ? 'rgba(99,102,241,0.05)' : 'rgba(99,102,241,0.08)'}
        linkWidth={link => link.cross ? 0.5 : 1}
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
