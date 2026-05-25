import { useEffect, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
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

  // Every adjacent pair of subjects gets 1–2 cross-links
  const ids = subjects.map(s => s.subject)
  for (let i = 0; i < ids.length - 1; i++) {
    const n = 1 + Math.floor(Math.random() * 2)
    for (let k = 0; k < n; k++) {
      links.push({ source: ids[i], target: ids[i + 1], cross: true })
    }
  }
  if (ids.length >= 3) {
    links.push({ source: ids[ids.length - 1], target: ids[0], cross: true })
  }

  return { nodes, links }
}

function makeNodeObject(node) {
  const group = new THREE.Group()

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(node.isSubject ? 1.5 : 0.6, 16, 16),
    new THREE.MeshBasicMaterial({
      color: '#6366f1',
      transparent: true,
      opacity: node.isSubject ? 0.5 : 0.25,
    })
  )
  group.add(sphere)

  if (node.isSubject) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(4, 16, 16),
      new THREE.MeshBasicMaterial({
        color: '#6366f1',
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    group.add(glow)
  }

  return group
}

export default function NeuralBackground() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })
  const graphRef = useRef()
  const rafRef = useRef()

  useEffect(() => {
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

  // Camera auto-orbit — starts after 1s to let the simulation settle
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!graphRef.current) return
      graphRef.current.cameraPosition({ x: 0, y: 40, z: 250 })
      let angle = 0
      const animate = () => {
        angle += 0.0008
        graphRef.current?.cameraPosition({
          x: 250 * Math.sin(angle),
          y: 40 + 10 * Math.sin(angle * 0.5),
          z: 250 * Math.cos(angle),
        })
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)
    }, 1000)

    return () => {
      clearTimeout(timeout)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Tune d3 forces once graph data is available
  useEffect(() => {
    if (!graphRef.current || graphData.nodes.length === 0) return
    graphRef.current.d3Force('charge').strength(-25)
    graphRef.current.d3Force('link').distance(link => link.cross ? 100 : 35)
    graphRef.current.d3Force('center').strength(0.04)
    graphRef.current.d3ReheatSimulation()
  }, [graphData])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.35,
        overflow: 'hidden',
      }}
    >
      <ForceGraph3D
        ref={graphRef}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
        enableNavigationControls={false}
        enablePointerInteraction={false}
        enableNodeDrag={false}
        nodeResolution={16}
        linkOpacity={0.1}
        linkWidth={0.3}
        linkColor={() => '#6366f1'}
        nodeThreeObject={makeNodeObject}
        nodeThreeObjectExtend={false}
        d3AlphaDecay={0.02}
        width={dims.w}
        height={dims.h}
      />
    </div>
  )
}
