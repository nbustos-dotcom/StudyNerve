import { useEffect, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import { api } from '../api/client'

// ── Graph builder ─────────────────────────────────────────────────────────────

function buildGraph(data) {
  const nodes = [{ id: 'core', name: 'StudyNerve', type: 'core', val: 50, fx: 0, fy: 0, fz: 0 }]
  const links = []

  const notesBySubject = {}
  for (const note of (data.notes || [])) {
    const key = note.subject || 'General'
    if (!notesBySubject[key]) notesBySubject[key] = []
    notesBySubject[key].push(note)
  }

  for (const sub of (data.subjects || [])) {
    nodes.push({
      id: sub.name,
      name: sub.name,
      type: 'subject',
      val: 8,
      noteCount: sub.note_count || 0,
      accuracy: sub.accuracy,
    })
    links.push({ source: 'core', target: sub.name })

    const visible = (notesBySubject[sub.name] || []).slice(0, 6)
    for (const note of visible) {
      nodes.push({
        id: `note-${note.id}`,
        name: note.title,
        type: 'note',
        val: 2,
        subject: sub.name,
      })
      links.push({ source: sub.name, target: `note-${note.id}` })
    }
  }

  return { nodes, links }
}

// ── Three.js node objects ─────────────────────────────────────────────────────

function makeNodeObject(node) {
  if (node.type === 'core') {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(5, 32, 32),
      new THREE.MeshPhongMaterial({ color: '#7c3aed', emissive: '#7c3aed', emissiveIntensity: 0.6, transparent: true, opacity: 0.9, shininess: 100, depthWrite: false })
    ))
    const spriteMat = new THREE.SpriteMaterial({ color: '#7c3aed', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.material.depthWrite = false
    sprite.renderOrder = 999
    sprite.scale.set(22, 22, 1)
    group.add(sprite)
    return group
  }

  if (node.type === 'subject') {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(3, 20, 20),
      new THREE.MeshPhongMaterial({ color: '#8b5cf6', emissive: '#8b5cf6', emissiveIntensity: 0.5, transparent: true, opacity: 0.9, depthWrite: false })
    ))
    const spriteMat = new THREE.SpriteMaterial({ color: '#8b5cf6', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false })
    const sprite = new THREE.Sprite(spriteMat)
    sprite.material.depthWrite = false
    sprite.renderOrder = 999
    sprite.scale.set(10, 10, 1)
    group.add(sprite)
    return group
  }

  return new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 12, 12),
    new THREE.MeshPhongMaterial({ color: '#6366f1', emissive: '#6366f1', emissiveIntensity: 0.35, transparent: true, opacity: 0.8, depthWrite: false })
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="flex-shrink-0 rounded-xl px-5 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-lg font-semibold text-zinc-100 leading-none">{value}</p>
      <p className="text-xs font-medium text-zinc-500 mt-1">{label}</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StudyUniverse() {
  const [data, setData] = useState(null)
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const graphRef = useRef()
  const rafRef = useRef()
  const containerRef = useRef()
  const isInteractingRef = useRef(false)
  const resumeTimeoutRef = useRef(null)

  useEffect(() => {
    api.studyUniverse()
      .then(d => { console.log('Universe data:', d); setData(d); setGraphData(buildGraph(d)); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // Measure container for ForceGraph3D dims
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setDims({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Bloom + scene lights — runs once after ForceGraph3D mounts
  useEffect(() => {
    if (!graphRef.current) return

    import('three/examples/jsm/postprocessing/UnrealBloomPass.js')
      .then(({ UnrealBloomPass }) => {
        if (!graphRef.current) return
        const bp = new UnrealBloomPass()
        bp.strength = 0.8
        bp.radius = 0.6
        bp.threshold = 0.2
        graphRef.current.postProcessingComposer().addPass(bp)
      })
      .catch(() => {})

    const scene = graphRef.current.scene()
    scene.add(new THREE.AmbientLight('#4a2888', 0.6))
    const dir = new THREE.DirectionalLight('#7c3aed', 0.3)
    dir.position.set(50, 50, 50)
    scene.add(dir)
    const pt = new THREE.PointLight('#7c3aed', 1, 300)
    pt.position.set(0, 0, 0)
    scene.add(pt)
  }, [])

  // Camera auto-orbit + core pulse (orbit pauses while user interacts)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!graphRef.current) return
      graphRef.current.cameraPosition({ x: 0, y: 40, z: 280 })
      let angle = 0
      const animate = () => {
        if (!isInteractingRef.current) {
          angle += 0.0006
          graphRef.current?.cameraPosition({
            x: 280 * Math.sin(angle),
            y: 40 + 10 * Math.sin(angle * 0.4),
            z: 280 * Math.cos(angle),
          })
          const gData = graphRef.current?.graphData?.()
          const coreNode = gData?.nodes?.find(n => n.type === 'core')
          const coreMesh = coreNode?.__threeObj?.children?.[0]
          if (coreMesh?.material) {
            coreMesh.material.emissiveIntensity = 0.6 + Math.sin(Date.now() * 0.002) * 0.15
          }
        }
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)
    }, 1200)

    return () => {
      clearTimeout(timeout)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
    }
  }, [])

  // d3 forces
  useEffect(() => {
    if (!graphRef.current || graphData.nodes.length === 0) return
    graphRef.current.d3Force('charge').strength(n => n.type === 'core' ? -300 : n.type === 'subject' ? -60 : -20)
    graphRef.current.d3Force('link').distance(link => {
      const src = typeof link.source === 'object' ? link.source.type : null
      return src === 'core' ? 100 : 45
    })
    graphRef.current.d3Force('center').strength(0.02)
    graphRef.current.d3ReheatSimulation()
  }, [graphData])

  function handleInteractionStart() {
    isInteractingRef.current = true
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
  }

  function handleInteractionEnd() {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current)
    resumeTimeoutRef.current = setTimeout(() => { isInteractingRef.current = false }, 5000)
  }

  const isEmpty = !loading && data && data.total_notes === 0
  const accuracy = data && data.total_questions_answered > 0
    ? Math.round((data.total_correct / data.total_questions_answered) * 100) : 0

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto fade-in-up">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-zinc-100">My Universe</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Drag nodes, scroll to zoom, click to interact. Your knowledge as a living constellation.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{ height: 'calc(100vh - 200px)', minHeight: 400, background: '#050508', border: '1px solid rgba(255,255,255,0.06)' }}
        onPointerDown={handleInteractionStart}
        onPointerUp={handleInteractionEnd}
        onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
      >
        {/* 3D graph — always mounted so ref is available for bloom setup */}
        <ForceGraph3D
          ref={graphRef}
          graphData={graphData}
          backgroundColor="#050508"
          showNavInfo={false}
          enableNavigationControls={true}
          enablePointerInteraction={true}
          enableNodeDrag={true}
          nodeResolution={16}
          linkOpacity={0.18}
          linkWidth={0.5}
          linkColor={() => 'rgba(139, 92, 246, 0.3)'}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={1}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleColor={() => '#a78bfa'}
          nodeThreeObject={makeNodeObject}
          nodeThreeObjectExtend={false}
          d3AlphaDecay={0.01}
          d3VelocityDecay={0.3}
          onNodeHover={node => setHoveredNode(node || null)}
          width={dims.w}
          height={dims.h}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#050508' }}>
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm text-zinc-500">Mapping your universe…</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 pointer-events-none">
            <p className="text-sm text-zinc-500 text-center max-w-xs leading-relaxed">
              Your universe is empty — add notes and take quizzes to see it grow
            </p>
          </div>
        )}

        {/* Hover tooltip */}
        {hoveredNode && hoveredNode.type !== 'core' && (
          <div
            style={{
              position: 'fixed',
              left: mousePos.x + 14,
              top: mousePos.y - 10,
              zIndex: 30,
              pointerEvents: 'none',
              background: 'rgba(17,17,19,0.92)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 8,
              padding: '7px 11px',
              whiteSpace: 'nowrap',
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: 2 }}>
              {hoveredNode.name}
            </p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
              {hoveredNode.type === 'subject'
                ? `${hoveredNode.noteCount} ${hoveredNode.noteCount === 1 ? 'note' : 'notes'}${hoveredNode.accuracy !== undefined ? ` · ${Math.round(hoveredNode.accuracy * 100)}%` : ''}`
                : hoveredNode.subject || ''}
            </p>
          </div>
        )}

        {/* Hint */}
        {!loading && !isEmpty && (
          <div style={{ position: 'absolute', bottom: 14, right: 16, fontSize: 10, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none', letterSpacing: '0.04em' }}>
            scroll to zoom · drag to orbit · pull nodes
          </div>
        )}
      </div>

      {/* Stat cards */}
      {data && !loading && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          <StatCard label="Subjects" value={data.subjects.length} />
          <StatCard label="Notes" value={data.total_notes} />
          <StatCard label="Accuracy" value={`${accuracy}%`} />
          <StatCard label="Study Streak" value={`${data.study_streak}d`} />
        </div>
      )}
    </div>
  )
}
