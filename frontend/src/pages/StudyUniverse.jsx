import { useEffect, useRef, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import { api } from '../api/client'
import StatCard from '../components/StatCard'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_META = {
  learning_pattern: { label: 'Learning Patterns', color: '#8b5cf6' },
  misconception:    { label: 'Misconceptions',    color: '#f87171' },
  preference:       { label: 'Preferences',       color: '#60a5fa' },
  strength:         { label: 'Strengths',         color: '#34d399' },
  knowledge:        { label: 'Knowledge',         color: '#6366f1' },
}

function topicColor(accuracy) {
  if (accuracy >= 0.8) return '#34d399'
  if (accuracy >= 0.6) return '#6366f1'
  if (accuracy >= 0.4) return '#f59e0b'
  return '#f87171'
}

// ── Graph builder ─────────────────────────────────────────────────────────────

function buildGraph(insights, topicStats) {
  const nodes = [{
    id: 'core', name: 'StudyNerve AI', type: 'core',
    val: 60, fx: 0, fy: 0, fz: 0,
  }]
  const links = []

  const activeCategories = new Set()
  for (const ins of insights) {
    if (ins.category && CATEGORY_META[ins.category]) activeCategories.add(ins.category)
  }
  if (topicStats.length > 0) activeCategories.add('knowledge')

  for (const cat of activeCategories) {
    nodes.push({ id: cat, name: CATEGORY_META[cat].label, type: 'category', val: 18 })
    links.push({ source: 'core', target: cat })
  }

  for (const ins of insights) {
    if (!ins.category || !CATEGORY_META[ins.category]) continue
    nodes.push({
      id: `insight-${ins.id}`,
      name: ins.insight,
      type: 'insight',
      category: ins.category,
      topicName: ins.topic_name || null,
      val: 3,
    })
    links.push({ source: ins.category, target: `insight-${ins.id}` })
  }

  for (const t of topicStats) {
    nodes.push({
      id: `topic-${t.topic_id}`,
      name: t.topic_name,
      type: 'topic',
      accuracy: t.accuracy,
      totalAttempts: t.total_attempts,
      correctAttempts: t.correct_attempts,
      val: 3 + Math.round(t.accuracy * 5),
    })
    links.push({ source: 'knowledge', target: `topic-${t.topic_id}` })
  }

  return { nodes, links }
}

// ── Three.js node objects (all SphereGeometry use 32, 32) ─────────────────────

function makeNodeObject(node) {
  if (node.type === 'core') {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(5, 32, 32),
      new THREE.MeshPhongMaterial({ color: '#7c3aed', emissive: '#7c3aed', emissiveIntensity: 0.7, transparent: true, opacity: 0.95, shininess: 100, depthWrite: false })
    ))
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(15, 32, 32),
      new THREE.MeshBasicMaterial({ color: '#7c3aed', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false })
    ))
    return group
  }

  if (node.type === 'category') {
    const meta = CATEGORY_META[node.id] ?? { color: '#6366f1' }
    const group = new THREE.Group()
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 32, 32),
      new THREE.MeshPhongMaterial({ color: meta.color, emissive: meta.color, emissiveIntensity: 0.55, transparent: true, opacity: 0.95, depthWrite: false })
    ))
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 32),
      new THREE.MeshBasicMaterial({ color: meta.color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })
    ))
    return group
  }

  if (node.type === 'insight') {
    const color = CATEGORY_META[node.category]?.color ?? '#8b5cf6'
    return new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 32, 32),
      new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.3, transparent: true, opacity: 0.8, depthWrite: false })
    )
  }

  if (node.type === 'topic') {
    const color = topicColor(node.accuracy ?? 0)
    const r = 1.2 + (node.accuracy ?? 0) * 0.8
    return new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 32),
      new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.25 + (node.accuracy ?? 0) * 0.4, transparent: true, opacity: 0.85, depthWrite: false })
    )
  }

  return new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 32),
    new THREE.MeshBasicMaterial({ color: '#6366f1', depthWrite: false })
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StudyUniverse() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [insights, setInsights] = useState([])
  const [topicStats, setTopicStats] = useState([])
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [notification, setNotification] = useState(null)
  const [notifFading, setNotifFading] = useState(false)

  const graphRef = useRef()
  const rafRef = useRef()
  const containerRef = useRef()
  // Latches true on the user's first real interaction (drag or wheel) and
  // never flips back. Auto-orbit runs only while this is false, so once the
  // user takes the camera they keep it for the rest of this mount — no
  // angle-stale snap on a resume timer.
  const userTookControlRef = useRef(false)
  const prevInsightCountRef = useRef(0)
  const prevNodeIdsRef = useRef(new Set())
  const notifTimerRef = useRef(null)

  useEffect(() => {
    Promise.allSettled([
      api.getInsights(),
      api.getTopicStats(),
    ]).then(([insRes, topRes]) => {
      const ins  = insRes.status === 'fulfilled' ? (insRes.value  ?? []) : []
      const tops = topRes.status === 'fulfilled' ? (topRes.value  ?? []) : []
      // Brain update notification — only after first load
      if (prevInsightCountRef.current > 0 && ins.length > prevInsightCountRef.current) {
        if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
        setNotifFading(false)
        setNotification('StudyNerve learned something new')
        // Chain both phases through the same ref so unmount cleanup catches
        // the fade-out timer too. Previously the inner setTimeout was lost,
        // letting setNotification(null) fire on an unmounted component.
        notifTimerRef.current = setTimeout(() => {
          setNotifFading(true)
          notifTimerRef.current = setTimeout(() => setNotification(null), 300)
        }, 4000)
      }
      prevInsightCountRef.current = ins.length

      setInsights(ins)
      setTopicStats(tops)
      setGraphData(buildGraph(ins, tops))
    }).catch(e => setError(e.message)).finally(() => setLoading(false))

    return () => { if (notifTimerRef.current) clearTimeout(notifTimerRef.current) }
  }, [])

  // Measure container — use offsetWidth/offsetHeight for true pixel dims
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => {
      const el = containerRef.current
      if (!el) return
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w > 0 && h > 0) setDims({ w, h })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Bloom + lights — must be torn down on unmount or repeat visits to this
  // route leak WebGL passes/lights into the renderer that react-force-graph-3d
  // keeps around for its own scene lifecycle.
  useEffect(() => {
    if (!graphRef.current) return

    let bloomPass = null
    let cancelled = false

    import('three/examples/jsm/postprocessing/UnrealBloomPass.js')
      .then(({ UnrealBloomPass }) => {
        if (cancelled || !graphRef.current) return
        bloomPass = new UnrealBloomPass()
        bloomPass.strength = 0.9
        bloomPass.radius = 0.6
        bloomPass.threshold = 0.1
        graphRef.current.postProcessingComposer().addPass(bloomPass)
      })
      .catch(() => {})

    const scene = graphRef.current.scene()
    const ambient = new THREE.AmbientLight('#3b1f6e', 0.6)
    const pt = new THREE.PointLight('#7c3aed', 1.2, 400)
    pt.position.set(0, 0, 0)
    scene.add(ambient)
    scene.add(pt)

    return () => {
      cancelled = true
      const g = graphRef.current
      if (bloomPass) {
        try { g?.postProcessingComposer()?.removePass(bloomPass) } catch {}
        try { bloomPass.dispose?.() } catch {}
      }
      try { scene.remove(ambient) } catch {}
      try { scene.remove(pt) } catch {}
      try { ambient.dispose?.() } catch {}
      try { pt.dispose?.() } catch {}
    }
  }, [])

  // Camera auto-orbit + core pulse — runs ONLY until the user first grabs
  // the camera. Once userTookControlRef latches true, both the initial fit
  // and the per-frame cameraPosition stop, so the camera stays exactly
  // where the user left it (no snap back to a stale orbit angle).
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!graphRef.current) return
      // If the user grabbed the camera in the first 1.2s before this
      // initial fit got a chance to fire, skip both the fit AND the orbit
      // loop entirely.
      if (userTookControlRef.current) return
      graphRef.current.cameraPosition({ x: 0, y: 40, z: 280 })
      let angle = 0
      const animate = () => {
        // Once the user has taken control we stop scheduling further frames
        // — the loop self-cancels rather than spinning forever doing nothing.
        if (userTookControlRef.current) return
        angle += 0.0005
        graphRef.current?.cameraPosition({
          x: 280 * Math.sin(angle),
          y: 40 + 12 * Math.sin(angle * 0.35),
          z: 280 * Math.cos(angle),
        })
        const gData = graphRef.current?.graphData?.()
        const coreNode = gData?.nodes?.find(n => n.type === 'core')
        const coreMesh = coreNode?.__threeObj?.children?.[0]
        if (coreMesh?.material) {
          coreMesh.material.emissiveIntensity = 0.7 + Math.sin(Date.now() * 0.0018) * 0.2
        }
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)
    }, 1200)

    return () => {
      clearTimeout(timeout)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // d3 forces
  useEffect(() => {
    if (!graphRef.current || graphData.nodes.length === 0) return
    graphRef.current.d3Force('charge').strength(n => {
      if (n.type === 'core')     return -400
      if (n.type === 'category') return -80
      return -25
    })
    graphRef.current.d3Force('link').distance(link => {
      const src = typeof link.source === 'object' ? link.source.type : null
      return src === 'core' ? 110 : 50
    })
    graphRef.current.d3Force('center').strength(0.02)
    graphRef.current.d3ReheatSimulation()
  }, [graphData])

  // Node entry animation — scale 0→1 with 30ms stagger, cubic ease-out.
  // Closure-scoped `cancelled` flag stops the per-node RAF chains on unmount;
  // tick also bails if the three object has been detached, so it can't
  // dereference a disposed mesh.
  useEffect(() => {
    if (graphData.nodes.length === 0) return
    let cancelled = false
    const animTimeout = setTimeout(() => {
      if (cancelled) return
      const nodes = graphRef.current?.graphData?.()?.nodes ?? []
      const newNodes = nodes.filter(n => !prevNodeIdsRef.current.has(n.id))
      prevNodeIdsRef.current = new Set(nodes.map(n => n.id))

      newNodes.forEach((node, i) => {
        const obj = node.__threeObj
        if (!obj) return
        obj.scale.set(0, 0, 0)
        const startTime = Date.now() + i * 30
        const duration = 800

        function tick() {
          if (cancelled || !obj.parent) return
          const elapsed = Date.now() - startTime
          if (elapsed < 0) { requestAnimationFrame(tick); return }
          const t = Math.min(elapsed / duration, 1)
          const ease = 1 - Math.pow(1 - t, 3)
          obj.scale.set(ease, ease, ease)
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
    }, 500)

    return () => { cancelled = true; clearTimeout(animTimeout) }
  }, [graphData])

  // Either trigger latches user control permanently — no 5s resume timer,
  // no way back to auto-orbit until next mount. This is intentional: the
  // alternative (resuming from a stale `angle`) teleports the camera.
  function handleUserControl() {
    userTookControlRef.current = true
  }

  const isEmpty = !loading && insights.length === 0 && topicStats.length === 0

  function tooltipContent(node) {
    if (!node || node.type === 'core') return null
    if (node.type === 'category') return { title: node.name, sub: null }
    if (node.type === 'insight') {
      return {
        title: node.name,
        sub: node.topicName ? `Topic: ${node.topicName}` : CATEGORY_META[node.category]?.label ?? node.category,
      }
    }
    if (node.type === 'topic') {
      const pct = Math.round((node.accuracy ?? 0) * 100)
      return {
        title: node.name,
        sub: `${pct}% mastery · ${node.totalAttempts} attempt${node.totalAttempts !== 1 ? 's' : ''}`,
      }
    }
    return null
  }

  const tip = hoveredNode ? tooltipContent(hoveredNode) : null

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto fade-in-up">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-zinc-100">AI Brain</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Every insight StudyNerve has learned about you — your patterns, gaps, strengths, and knowledge.
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{ height: 'calc(100vh - 200px)', minHeight: 400, background: '#050508', border: '1px solid rgba(255,255,255,0.06)' }}
        onPointerDown={handleUserControl}
        onWheel={handleUserControl}
        onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
      >
        <ForceGraph3D
          ref={graphRef}
          graphData={graphData}
          backgroundColor="#050508"
          controlType="orbit"
          showNavInfo={false}
          enableNavigationControls={true}
          enablePointerInteraction={true}
          enableNodeDrag={true}
          nodeResolution={16}
          nodeLabel={() => ''}
          linkOpacity={0.15}
          linkWidth={0.4}
          linkColor={() => 'rgba(139, 92, 246, 0.25)'}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={0.8}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleColor={() => '#a78bfa'}
          nodeThreeObject={makeNodeObject}
          nodeThreeObjectExtend={false}
          d3AlphaDecay={0.01}
          d3VelocityDecay={0.3}
          onNodeHover={node => setHoveredNode(node || null)}
          width={dims.w}
          height={dims.h}
        />

        {/* Brain update notification */}
        {notification && (
          <div
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              zIndex: 20,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(18,18,22,0.92)',
              border: '1px solid rgba(124,58,237,0.2)',
              borderRadius: 10,
              padding: '8px 14px',
              opacity: notifFading ? 0 : 1,
              transform: notifFading ? 'translateY(-4px)' : 'translateY(0)',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
              animation: notifFading ? 'none' : 'notifSlideDown 0.3s ease',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', flexShrink: 0, boxShadow: '0 0 6px rgba(124,58,237,0.8)' }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: 500 }}>
              StudyNerve learned something new
            </span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#050508' }}>
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm text-zinc-500">Loading AI memory…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 pointer-events-none px-8">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <svg className="w-6 h-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 5v2M12 17v2M5 12H3M21 12h-2M7.05 7.05 5.64 5.64M18.36 18.36l-1.41-1.41M7.05 16.95l-1.41 1.41M18.36 5.64l-1.41 1.41"/>
              </svg>
            </div>
            <p className="text-sm text-zinc-500 text-center max-w-xs leading-relaxed">
              StudyNerve is learning about you. Take quizzes and chat with the tutor to see your AI brain grow.
            </p>
          </div>
        )}

        {/* Hover tooltip */}
        {tip && (
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
              maxWidth: 280,
              whiteSpace: 'normal',
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.92)', marginBottom: tip.sub ? 3 : 0, lineHeight: 1.4 }}>
              {tip.title}
            </p>
            {tip.sub && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>{tip.sub}</p>
            )}
          </div>
        )}

        {/* Hint */}
        {!loading && !isEmpty && (
          <div style={{ position: 'absolute', bottom: 14, right: 16, fontSize: 10, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none', letterSpacing: '0.04em' }}>
            scroll to zoom · drag to orbit · hover nodes
          </div>
        )}
      </div>

      {/* Stat cards */}
      {!loading && (() => {
        const avgMastery = topicStats.length > 0
          ? topicStats.reduce((s, t) => s + t.accuracy, 0) / topicStats.length
          : null
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Insights" value={insights.length} />
            <StatCard label="Topics Quizzed" value={topicStats.length} />
            <StatCard
              label="Avg Mastery"
              value={avgMastery != null ? `${Math.round(avgMastery * 100)}%` : '—'}
              accent
              progress={avgMastery}
            />
            <StatCard
              label="Learning Patterns"
              value={insights.filter(i => i.category === 'learning_pattern').length}
            />
          </div>
        )
      })()}
    </div>
  )
}
